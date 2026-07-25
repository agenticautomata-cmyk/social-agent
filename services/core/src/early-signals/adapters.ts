import type { SourceWatcher } from '../schema.js';
import type { NormalizedAdapterResult } from './types.js';
import {
  contentHash,
  detectKeywordMatches,
  extractDomain,
  mergeKeywordPatterns,
} from './keywords.js';
import type { KeywordPattern } from './keywords.js';

export type AdapterRunResult = {
  ok: boolean;
  changed: boolean;
  results: NormalizedAdapterResult[];
  contentHash: string;
  extractedContent: string;
  responseStatus: number | null;
  changeSummary: string | null;
  error?: string;
};

const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BensonEarlySignals/1.0; +https://benson.kckellie.com)';

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssItems(xml: string): string[] {
  const items: string[] = [];
  const re = /<item[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    items.push(stripHtml(match[0]).slice(0, 4000));
  }
  if (items.length === 0) {
    const entryRe = /<entry[\s\S]*?<\/entry>/gi;
    while ((match = entryRe.exec(xml))) {
      items.push(stripHtml(match[0]).slice(0, 4000));
    }
  }
  return items;
}

function titleFromText(text: string, fallback: string): string {
  const line = text.split(/[.!?\n]/).find((l) => l.trim().length > 12);
  return (line ?? fallback).trim().slice(0, 180);
}

function buildResult(input: {
  watcher: SourceWatcher;
  text: string;
  changeSummary: string;
  keywords: KeywordPattern[];
  signalTypeOverride?: string;
}): NormalizedAdapterResult | null {
  const matches = detectKeywordMatches(input.text, input.keywords);
  if (matches.length === 0) return null;

  const top = matches.sort((a, b) => b.pattern.weight - a.pattern.weight)[0]!;
  const entityName =
    (input.watcher.config as { entityName?: string }).entityName ??
    titleFromText(input.text, input.watcher.sourceName);

  return {
    entityName,
    address: (input.watcher.config as { address?: string }).address ?? null,
    city: (input.watcher.config as { city?: string }).city ?? 'Kansas City',
    state: (input.watcher.config as { state?: string }).state ?? 'MO',
    signalType: input.signalTypeOverride ?? top.pattern.signalType,
    changeSummary: input.changeSummary,
    relevantDates: [],
    sourceName: input.watcher.sourceName,
    sourceUrl: input.watcher.sourceUrl,
    sourceCategory: input.watcher.sourceCategory,
    supportingText: input.text.slice(0, 2000),
    matchedKeywords: matches.map((m) => m.match),
    reliabilityInputs: [
      input.watcher.adapterType === 'rss_feed' ? 'Structured RSS feed' : 'Public page change',
      `Matched: ${matches.map((m) => m.match).join(', ')}`,
    ],
    detectedAt: new Date(),
    contentHash: contentHash(`${input.watcher.id}:${input.text.slice(0, 5000)}`),
    metadata: { domain: extractDomain(input.watcher.sourceUrl) },
  };
}

export async function runHtmlWatchAdapter(
  watcher: SourceWatcher,
  keywords: KeywordPattern[],
  previousHash: string | null,
): Promise<AdapterRunResult> {
  try {
    const res = await fetch(watcher.sourceUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
    const html = await res.text();
    const text = stripHtml(html).slice(0, 12000);
    const hash = contentHash(text);
    const changed = previousHash != null && previousHash !== hash;
    const matches = detectKeywordMatches(text, keywords);
    if (matches.length === 0) {
      return {
        ok: true,
        changed: false,
        results: [],
        contentHash: hash,
        extractedContent: text.slice(0, 4000),
        responseStatus: res.status,
        changeSummary: null,
      };
    }

    const result = buildResult({
      watcher,
      text,
      changeSummary: changed ? 'Page content changed with early-signal keywords' : 'Keywords detected on page',
      keywords,
    });

    return {
      ok: true,
      changed: changed || previousHash == null,
      results: result ? [result] : [],
      contentHash: hash,
      extractedContent: text.slice(0, 4000),
      responseStatus: res.status,
      changeSummary: result?.changeSummary ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      changed: false,
      results: [],
      contentHash: previousHash ?? '',
      extractedContent: '',
      responseStatus: null,
      changeSummary: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runRssWatchAdapter(
  watcher: SourceWatcher,
  keywords: KeywordPattern[],
  previousHash: string | null,
): Promise<AdapterRunResult> {
  try {
    const res = await fetch(watcher.sourceUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
    });
    const xml = await res.text();
    const items = parseRssItems(xml);
    const combined = items.join('\n').slice(0, 12000);
    const hash = contentHash(combined);
    const changed = previousHash != null && previousHash !== hash;
    const results: NormalizedAdapterResult[] = [];

    for (const itemText of items.slice(0, 8)) {
      const row = buildResult({
        watcher,
        text: itemText,
        changeSummary: 'New or updated RSS item',
        keywords,
      });
      if (row) results.push(row);
    }

    return {
      ok: true,
      changed: changed && results.length > 0,
      results,
      contentHash: hash,
      extractedContent: combined.slice(0, 4000),
      responseStatus: res.status,
      changeSummary: results[0]?.changeSummary ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      changed: false,
      results: [],
      contentHash: previousHash ?? '',
      extractedContent: '',
      responseStatus: null,
      changeSummary: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

type SocrataWatcherConfig = {
  socrataQuery?: string;
  textFields?: string[];
  addressFields?: string[];
  entityField?: string;
  linkField?: string;
  idField?: string;
  dateField?: string;
  city?: string;
  state?: string;
  cityField?: string;
  stateField?: string;
  matchPatterns?: string[];
  signalType?: string;
};

function pickRowField(row: Record<string, unknown>, field?: string): string {
  if (!field) return '';
  const value = row[field];
  if (value == null || value === 'NULL') return '';
  return String(value).trim();
}

function rowMatchesPatterns(text: string, patterns: string[] | undefined, keywords: KeywordPattern[]): boolean {
  if (detectKeywordMatches(text, keywords).length > 0) return true;
  if (!patterns?.length) return false;
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function encodeSocrataQuery(query: string): string {
  return query
    .split('&')
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return part;
      return `${part.slice(0, eq + 1)}${encodeURIComponent(part.slice(eq + 1))}`;
    })
    .join('&');
}

export async function runSocrataJsonAdapter(
  watcher: SourceWatcher,
  keywords: KeywordPattern[],
  previousHash: string | null,
): Promise<AdapterRunResult> {
  const config = (watcher.config ?? {}) as SocrataWatcherConfig;
  const query = encodeSocrataQuery(config.socrataQuery ?? '$limit=20');
  const separator = watcher.sourceUrl.includes('?') ? '&' : '?';
  const url = `${watcher.sourceUrl}${separator}${query}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      return {
        ok: false,
        changed: false,
        results: [],
        contentHash: previousHash ?? '',
        extractedContent: '',
        responseStatus: res.status,
        changeSummary: null,
        error: `HTTP ${res.status}`,
      };
    }

    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows)) {
      return {
        ok: false,
        changed: false,
        results: [],
        contentHash: previousHash ?? '',
        extractedContent: '',
        responseStatus: res.status,
        changeSummary: null,
        error: 'invalid_json_array',
      };
    }

    const idField = config.idField ?? 'id';
    const hashPayload = rows
      .map((row) => `${pickRowField(row, idField)}:${pickRowField(row, config.dateField)}`)
      .join('|');
    const hash = contentHash(hashPayload);
    const changed = previousHash != null && previousHash !== hash;

    const textFields = config.textFields ?? Object.keys(rows[0] ?? {}).slice(0, 6);
    const results: NormalizedAdapterResult[] = [];

    for (const row of rows.slice(0, 25)) {
      const text = textFields.map((f) => pickRowField(row, f)).filter(Boolean).join(' — ');
      if (!text) continue;
      if (!rowMatchesPatterns(text, config.matchPatterns, keywords)) continue;

      const entityName =
        pickRowField(row, config.entityField) ||
        pickRowField(row, textFields[0]) ||
        titleFromText(text, watcher.sourceName);
      const address = (config.addressFields ?? [])
        .map((f) => pickRowField(row, f))
        .filter(Boolean)
        .join(' ');
      const link = pickRowField(row, config.linkField);
      const rowId = pickRowField(row, idField) || contentHash(text);

      results.push({
        entityName,
        address: address || null,
        city: pickRowField(row, config.cityField) || config.city || 'Kansas City',
        state: pickRowField(row, config.stateField) || config.state || 'MO',
        signalType: config.signalType ?? 'permit',
        changeSummary: `New or updated ${watcher.sourceCategory.replace(/_/g, ' ')} record`,
        relevantDates: config.dateField && pickRowField(row, config.dateField)
          ? [pickRowField(row, config.dateField)]
          : [],
        sourceName: watcher.sourceName,
        sourceUrl: link || watcher.sourceUrl,
        sourceCategory: watcher.sourceCategory,
        supportingText: text.slice(0, 2000),
        matchedKeywords: detectKeywordMatches(text, keywords).map((m) => m.match),
        reliabilityInputs: ['Official open-data API', watcher.sourceName],
        detectedAt: new Date(),
        contentHash: contentHash(`${watcher.id}:${rowId}:${text.slice(0, 500)}`),
        metadata: { rowId, dataset: watcher.sourceUrl },
      });
    }

    const extractedContent = rows
      .slice(0, 5)
      .map((row) => textFields.map((f) => pickRowField(row, f)).join(' | '))
      .join('\n');

    return {
      ok: true,
      changed: changed || previousHash == null,
      results,
      contentHash: hash,
      extractedContent: extractedContent.slice(0, 4000),
      responseStatus: res.status,
      changeSummary: results[0]?.changeSummary ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      changed: false,
      results: [],
      contentHash: previousHash ?? '',
      extractedContent: '',
      responseStatus: null,
      changeSummary: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runWatcherAdapter(
  watcher: SourceWatcher,
  keywords: KeywordPattern[] | undefined,
  previousHash: string | null,
): Promise<AdapterRunResult> {
  const merged = mergeKeywordPatterns(keywords);
  switch (watcher.adapterType) {
    case 'rss_feed':
      return runRssWatchAdapter(watcher, merged, previousHash);
    case 'socrata_json':
      return runSocrataJsonAdapter(watcher, merged, previousHash);
    case 'html_watch':
    default:
      return runHtmlWatchAdapter(watcher, merged, previousHash);
  }
}

export function normalizedFromManualTip(input: {
  title: string;
  summary: string;
  sourceUrl?: string | null;
  businessName?: string | null;
  signalType?: string;
  keywords?: KeywordPattern[];
}): NormalizedAdapterResult {
  const text = `${input.title}\n${input.summary}`;
  const matches = detectKeywordMatches(text, mergeKeywordPatterns(input.keywords));
  return {
    entityName: input.businessName ?? input.title,
    address: null,
    city: 'Kansas City',
    state: 'MO',
    signalType: input.signalType ?? matches[0]?.pattern.signalType ?? 'tip',
    changeSummary: 'User-submitted tip',
    relevantDates: [],
    sourceName: 'Manual tip',
    sourceUrl: input.sourceUrl ?? '',
    sourceCategory: 'user_tip',
    supportingText: text,
    matchedKeywords: matches.map((m) => m.match),
    reliabilityInputs: ['User-submitted tip'],
    detectedAt: new Date(),
    contentHash: contentHash(text),
  };
}
