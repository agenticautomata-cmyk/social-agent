import { createHash } from 'node:crypto';
import { normalizeBusinessKey } from '../creator-interest/normalize.js';
import type { ExtractedNewsletterItem } from './types.js';

const TITLE_STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'at',
  'in',
  'on',
  'for',
  'and',
  'with',
  'years',
  'year',
  'anniversary',
  'live',
  'tour',
  'presented',
  'by',
  'featuring',
  'feat',
]);

export function normalizeTitleTokens(title: string): string {
  return title
    .toLowerCase()
    .replace(/blow\s*out/g, 'blowout')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !TITLE_STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .sort()
    .join(' ');
}

export function normalizePerformerKey(entityName: string, title: string): string {
  const entity = normalizeBusinessKey(entityName);
  const titleTokens = normalizeTitleTokens(title);
  const performerFromTitle = titleTokens.split(' ').slice(0, 3).join(' ');
  return entity || performerFromTitle;
}

export function buildNewsletterOccurrenceFingerprint(
  item: ExtractedNewsletterItem,
  canonicalUrl: string | null,
): string {
  const parts = [
    normalizePerformerKey(item.entityName, item.title),
    normalizeTitleTokens(item.title),
    (item.startDate ?? '').trim(),
    normalizeBusinessKey(item.venue ?? ''),
    (item.city ?? '').toLowerCase().trim(),
    extractHost(canonicalUrl ?? item.ticketLink ?? item.sourceUrl),
    extractHost(item.ticketLink),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function extractHost(url: string | null | undefined): string {
  if (!url?.trim()) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export type DuplicateCluster = {
  fingerprint: string;
  records: Array<{
    entityName: string;
    title: string;
    date: string | null;
    venue: string | null;
    gmailMessageId: string;
  }>;
};

export function findProbableDuplicateClusters(
  records: Array<{
    fingerprint: string | null;
    entityName: string;
    title: string;
    date: string | null;
    venue: string | null;
    gmailMessageId: string;
  }>,
): DuplicateCluster[] {
  const clusters: DuplicateCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < records.length; i++) {
    if (used.has(i)) continue;
    const a = records[i]!;
    if (!a.date) continue; // undated inventory entities are not occurrence duplicates
    const group = [a];
    used.add(i);
    for (let j = i + 1; j < records.length; j++) {
      if (used.has(j)) continue;
      const b = records[j]!;
      if (a.date !== b.date) continue;
      const samePerformer =
        normalizePerformerKey(a.entityName, a.title) === normalizePerformerKey(b.entityName, b.title);
      const sameVenue =
        normalizeBusinessKey(a.venue ?? '') === normalizeBusinessKey(b.venue ?? '') &&
        Boolean(a.venue);
      if ((samePerformer || sameVenue) && titlesLikelySameEvent(a.title, b.title)) {
        group.push(b);
        used.add(j);
      }
    }
    if (group.length >= 2) {
      clusters.push({
        fingerprint: [
          normalizePerformerKey(a.entityName, a.title),
          a.date,
          normalizeBusinessKey(a.venue ?? ''),
        ].join('|'),
        records: group,
      });
    }
  }
  return clusters;
}

/** Returns true when two titles likely describe the same event (e.g. Digable Planets variants). */
export function titlesLikelySameEvent(a: string, b: string): boolean {
  const ta = new Set(normalizeTitleTokens(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeTitleTokens(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap += 1;
  }
  const union = new Set([...ta, ...tb]).size;
  return overlap / union >= 0.5;
}
