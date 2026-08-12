import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TokenEfficientEmailResult } from './pipeline-token-efficient.js';
import type { ExtractedNewsletterItem } from './types.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const LEGACY_EXTRACT_CACHE = resolve(scriptDir, '../../../../.cache/newsletter-extract');
const LEGACY_REPORT = resolve(
  scriptDir,
  '../../../../reports/newsletter-dry-run-reclassified-2026-07-28T01-46-57-054Z.json',
);

function legacyExtractCacheKey(gmailMessageId: string): string {
  return createHash('sha256').update(`gmail:${gmailMessageId.trim()}`).digest('hex').slice(0, 24);
}

function loadLegacyExtractItems(gmailMessageId: string): ExtractedNewsletterItem[] {
  const key = legacyExtractCacheKey(gmailMessageId);
  const path = resolve(LEGACY_EXTRACT_CACHE, `${key}.json`);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { items?: ExtractedNewsletterItem[] };
    return parsed.items ?? [];
  } catch {
    return [];
  }
}

type LegacyOccurrence = {
  gmailMessageId: string;
  title: string;
  date: string | null;
  layer: string;
  location: string | null;
  fingerprint: string | null;
};

function legacyOccurrenceKey(row: LegacyOccurrence): string {
  return `${row.gmailMessageId}|${(row.fingerprint ?? row.title).toLowerCase()}`;
}

function newOccurrenceKey(result: TokenEfficientEmailResult, title: string, date: string | null): string {
  return `${result.gmailMessageId}|${title.toLowerCase()}|${date ?? ''}`;
}

export type LegacyComparisonReport = {
  sampleIds: number;
  legacyCacheHits: number;
  legacyQualifyingEvents: number;
  newQualifyingEvents: number;
  retainedByBoth: number;
  legacyOnly: Array<{ gmailMessageId: string; title: string; date: string | null; reason?: string }>;
  newOnly: Array<{ gmailMessageId: string; title: string; date: string | null }>;
  meaningfulLosses: Array<{ gmailMessageId: string; title: string; date: string | null; reason: string }>;
  junkRemoved: number;
  overlapRate: number | null;
};

function loadLegacyOccurrencesForIds(ids: Set<string>): LegacyOccurrence[] {
  const out: LegacyOccurrence[] = [];

  for (const gmailMessageId of ids) {
    const cachedItems = loadLegacyExtractItems(gmailMessageId);
    for (const item of cachedItems) {
      if (item.layer !== 'occurrence' || !item.startDate) continue;
      out.push({
        gmailMessageId,
        title: item.title,
        date: item.startDate,
        layer: item.layer,
        location: [item.venue, item.city].filter(Boolean).join(', ') || null,
        fingerprint: createHash('sha256')
          .update(`${item.title}|${item.startDate}|${item.venue ?? ''}`)
          .digest('hex')
          .slice(0, 32),
      });
    }
  }

  if (out.length > 0 || !existsSync(LEGACY_REPORT)) {
    return out;
  }

  const parsed = JSON.parse(readFileSync(LEGACY_REPORT, 'utf8')) as {
    report?: { acceptedSamples?: Array<Record<string, unknown>> };
  };
  const samples = parsed.report?.acceptedSamples ?? [];
  for (const row of samples) {
    const gmailMessageId = String(row.gmailMessageId ?? '');
    if (!ids.has(gmailMessageId)) continue;
    if (row.layer !== 'occurrence' || !row.date) continue;
    out.push({
      gmailMessageId,
      title: String(row.title ?? ''),
      date: row.date ? String(row.date) : null,
      layer: String(row.layer),
      location: row.location ? String(row.location) : null,
      fingerprint: row.fingerprint ? String(row.fingerprint) : null,
    });
  }
  return out;
}

export function compareAgainstLegacyCachedResults(input: {
  sampleMessageIds: string[];
  newResults: TokenEfficientEmailResult[];
}): LegacyComparisonReport {
  const idSet = new Set(input.sampleMessageIds);
  const legacy = loadLegacyOccurrencesForIds(idSet);

  const legacyKeys = new Map<string, LegacyOccurrence>();
  for (const row of legacy) {
    legacyKeys.set(legacyOccurrenceKey(row), row);
  }

  const newOccurrences: Array<{ key: string; gmailMessageId: string; title: string; date: string | null }> = [];
  for (const result of input.newResults) {
    if (!idSet.has(result.gmailMessageId)) continue;
    for (const item of result.acceptedItems) {
      if (item.layer !== 'occurrence' || !item.startDate) continue;
      const key = newOccurrenceKey(result, item.title, item.startDate);
      newOccurrences.push({
        key,
        gmailMessageId: result.gmailMessageId,
        title: item.title,
        date: item.startDate,
      });
    }
  }

  const newKeySet = new Set(newOccurrences.map((n) => n.key));
  const legacyKeySet = new Set(legacyKeys.keys());

  let retainedByBoth = 0;
  const legacyOnly: LegacyComparisonReport['legacyOnly'] = [];
  for (const [key, row] of legacyKeys) {
    if (newKeySet.has(key)) {
      retainedByBoth += 1;
    } else {
      const newResult = input.newResults.find((r) => r.gmailMessageId === row.gmailMessageId);
      const reason =
        newResult?.primaryOutcome === 'rejected_pre_llm'
          ? `prefilter:${newResult.skipReason}`
          : newResult?.primaryOutcome === 'provider_blocked'
            ? 'provider_blocked'
            : newResult && newResult.qualifyingEvents === 0
              ? 'not_retained_by_new_pipeline'
              : 'title_or_date_mismatch';
      legacyOnly.push({
        gmailMessageId: row.gmailMessageId,
        title: row.title,
        date: row.date,
        reason,
      });
    }
  }

  const newOnly = newOccurrences
    .filter((n) => !legacyKeySet.has(n.key))
    .map((n) => ({ gmailMessageId: n.gmailMessageId, title: n.title, date: n.date }));

  const meaningfulLosses = legacyOnly.filter(
    (row) =>
      row.reason !== 'prefilter:product_sales' &&
      row.reason !== 'prefilter:percent_off_offer' &&
      row.reason !== 'prefilter:product_catalog' &&
      !row.reason?.startsWith('prefilter:') &&
      row.reason !== 'not_retained_by_new_pipeline',
  );

  const junkRemoved = legacyOnly.filter((row) => row.reason?.startsWith('prefilter:')).length;

  return {
    sampleIds: idSet.size,
    legacyCacheHits: [...idSet].filter((id) => loadLegacyExtractItems(id).length > 0).length,
    legacyQualifyingEvents: legacy.length,
    newQualifyingEvents: newOccurrences.length,
    retainedByBoth,
    legacyOnly,
    newOnly,
    meaningfulLosses,
    junkRemoved,
    overlapRate: legacy.length > 0 ? retainedByBoth / legacy.length : null,
  };
}
