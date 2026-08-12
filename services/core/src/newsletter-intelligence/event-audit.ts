import { createHash } from 'node:crypto';
import { isKcMetroLocation, isOutOfMarketLocation } from '../ask-benson/url-geo.js';
import type { TokenEfficientEmailResult } from './pipeline-token-efficient.js';
import type { ExtractedNewsletterItem } from './types.js';

export type EventAuditCategory =
  | 'valid_complete_event'
  | 'true_freebie'
  | 'tiktok_worthy_event'
  | 'duplicate'
  | 'individual_product_sale'
  | 'generic_promotion'
  | 'incomplete_event'
  | 'stale_event'
  | 'nonlocal_event'
  | 'false_positive';

export type AuditedEvent = {
  gmailMessageIdHash: string;
  gmailMessageId: string;
  sender: string;
  subject: string;
  title: string;
  date: string | null;
  startTime: string | null;
  allDay: boolean;
  venue: string | null;
  city: string | null;
  sourceUrl: string | null;
  isFree: boolean | null;
  tiktokSignals: string[];
  extractionSource: 'text' | 'local_ocr' | 'cache' | 'mixed';
  destination: string;
  confidence: number;
  category: EventAuditCategory;
  primaryOutcome: string;
};

export type EventAuditReport = {
  events: AuditedEvent[];
  uniqueEmailsProducingEvents: number;
  eventsPerEmail: Record<string, number>;
  roundupEmails: string[];
  singleEventEmails: string[];
  duplicateClusters: Array<{ key: string; count: number; titles: string[] }>;
  invalidEvents: AuditedEvent[];
  categoryCounts: Record<EventAuditCategory, number>;
  precision: number | null;
  gates: {
    zeroProductSales: boolean;
    zeroVaguePromotions: boolean;
    zeroPastEvents: boolean;
    zeroIncompletePhysicalEvents: boolean;
    noDuplicateClusters: boolean;
    precisionAtLeast90: boolean;
  };
  passed: boolean;
  blockers: string[];
};

const PRODUCT_SALE =
  /\b(?:\d+% off|\$\d+(?:\.\d{2})?\s*(?:only|each|item)?|bogo|buy one get one|clearance|flash sale|coupon code|promo code|use code)\b/i;
const VAGUE_PROMO = /\b(?:something exciting|stay tuned|big news|coming soon|don't miss this|you won't want to miss)\b/i;
const TIKTOK =
  /\b(?:pop-up|popup|secret|invite-only|rooftop|limited capacity|viral|tiktok)\b/i;

function hashGmailId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 16);
}

function inferExtractionSource(result: TokenEfficientEmailResult): AuditedEvent['extractionSource'] {
  if (result.primaryOutcome === 'cache_hit') return 'cache';
  const ocrOnly = result.eventsFromOcrOnly > 0;
  const hadOcr = result.tokenRecord.localOcrRuns + result.tokenRecord.localOcrCacheHits > 0;
  if (ocrOnly || (hadOcr && result.primaryOutcome === 'llm_extracted')) return 'local_ocr';
  if (hadOcr) return 'mixed';
  return 'text';
}

function isStaleDate(iso: string | null, referenceMs: number): boolean {
  if (!iso) return false;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return false;
  return referenceMs - parsed > 14 * 86400000;
}

function categorizeEvent(
  item: ExtractedNewsletterItem,
  result: TokenEfficientEmailResult,
  referenceMs: number,
): EventAuditCategory {
  const blob = `${item.title} ${item.description ?? ''} ${item.price ?? ''}`;
  if (PRODUCT_SALE.test(blob)) return 'individual_product_sale';
  if (VAGUE_PROMO.test(blob) || VAGUE_PROMO.test(result.subject)) return 'generic_promotion';
  if (isOutOfMarketLocation([item.venue, item.city, item.state].filter(Boolean).join(' '))) {
    return 'nonlocal_event';
  }
  if (isStaleDate(item.startDate, referenceMs)) return 'stale_event';
  if (!item.startDate || (!item.startTime && item.layer === 'occurrence')) {
    if (!item.venue && !item.city) return 'incomplete_event';
  }
  if (!item.venue && !item.city && item.layer === 'occurrence') return 'incomplete_event';
  if (item.isFree) return 'true_freebie';
  if (TIKTOK.test(blob) || TIKTOK.test(result.subject)) return 'tiktok_worthy_event';
  if (item.layer === 'occurrence' && item.startDate && (item.venue || item.city)) {
    return 'valid_complete_event';
  }
  return 'false_positive';
}

function duplicateKey(item: ExtractedNewsletterItem, gmailMessageId: string): string {
  return `${gmailMessageId}|${item.title.toLowerCase().trim()}|${item.startDate ?? ''}|${(item.venue ?? item.city ?? '').toLowerCase()}`;
}

export function auditQualifyingEvents(input: {
  results: TokenEfficientEmailResult[];
  corpusById: Map<
    string,
    { senderEmail: string | null; senderName: string | null; subject: string }
  >;
  referenceNow?: Date;
}): EventAuditReport {
  const referenceMs = (input.referenceNow ?? new Date()).getTime();
  const events: AuditedEvent[] = [];
  const eventsPerEmail: Record<string, number> = {};
  const duplicateMap = new Map<string, { count: number; titles: string[] }>();

  for (const result of input.results) {
    const corpus = input.corpusById.get(result.gmailMessageId);
    const sender =
      corpus?.senderName ??
      corpus?.senderEmail ??
      result.senderDomain ??
      'unknown';

    for (const item of result.acceptedItems) {
      if (item.layer !== 'occurrence' || !item.startDate) continue;

      const category = categorizeEvent(item, result, referenceMs);
      const audited: AuditedEvent = {
        gmailMessageIdHash: hashGmailId(result.gmailMessageId),
        gmailMessageId: result.gmailMessageId,
        sender,
        subject: corpus?.subject ?? result.subject,
        title: item.title,
        date: item.startDate,
        startTime: item.startTime,
        allDay: !item.startTime,
        venue: item.venue,
        city: item.city,
        sourceUrl: item.sourceUrl,
        isFree: item.isFree,
        tiktokSignals: TIKTOK.test(`${item.title} ${result.subject}`) ? ['subject_or_title_match'] : [],
        extractionSource: inferExtractionSource(result),
        destination: 'accepted_items',
        confidence: item.confidence,
        category,
        primaryOutcome: result.primaryOutcome,
      };
      events.push(audited);
      eventsPerEmail[result.gmailMessageId] = (eventsPerEmail[result.gmailMessageId] ?? 0) + 1;

      const dKey = duplicateKey(item, result.gmailMessageId);
      const existing = duplicateMap.get(dKey);
      if (existing) {
        existing.count += 1;
        existing.titles.push(item.title);
      } else {
        duplicateMap.set(dKey, { count: 1, titles: [item.title] });
      }
    }
  }

  const duplicateClusters = [...duplicateMap.entries()]
    .filter(([, v]) => v.count > 1)
    .map(([key, v]) => ({ key, count: v.count, titles: v.titles }));

  const roundupEmails = Object.entries(eventsPerEmail)
    .filter(([, count]) => count >= 3)
    .map(([id]) => id);
  const singleEventEmails = Object.entries(eventsPerEmail)
    .filter(([, count]) => count === 1)
    .map(([id]) => id);

  const categoryCounts = Object.fromEntries(
    [
      'valid_complete_event',
      'true_freebie',
      'tiktok_worthy_event',
      'duplicate',
      'individual_product_sale',
      'generic_promotion',
      'incomplete_event',
      'stale_event',
      'nonlocal_event',
      'false_positive',
    ].map((c) => [c, 0]),
  ) as Record<EventAuditCategory, number>;

  for (const event of events) {
    categoryCounts[event.category] += 1;
  }

  const validCategories: EventAuditCategory[] = [
    'valid_complete_event',
    'true_freebie',
    'tiktok_worthy_event',
  ];
  const validCount = events.filter((e) => validCategories.includes(e.category)).length;
  const precision =
    events.length > 0 ? Math.round((validCount / events.length) * 1000) / 1000 : null;

  const invalidCategories: EventAuditCategory[] = [
    'individual_product_sale',
    'generic_promotion',
    'incomplete_event',
    'stale_event',
    'nonlocal_event',
    'false_positive',
  ];
  const invalidEvents = events.filter((e) => invalidCategories.includes(e.category));

  const gates = {
    zeroProductSales: categoryCounts.individual_product_sale === 0,
    zeroVaguePromotions: categoryCounts.generic_promotion === 0,
    zeroPastEvents: categoryCounts.stale_event === 0,
    zeroIncompletePhysicalEvents: categoryCounts.incomplete_event === 0,
    noDuplicateClusters: duplicateClusters.length === 0,
    precisionAtLeast90: precision != null && precision >= 0.9,
  };

  const blockers: string[] = [];
  if (!gates.zeroProductSales) blockers.push('product sales in accepted events');
  if (!gates.zeroVaguePromotions) blockers.push('vague promotions in accepted events');
  if (!gates.zeroPastEvents) blockers.push('stale/past events in accepted set');
  if (!gates.zeroIncompletePhysicalEvents) blockers.push('incomplete physical events');
  if (!gates.noDuplicateClusters) blockers.push(`${duplicateClusters.length} duplicate clusters`);
  if (events.length === 0) {
    blockers.push('no auditable accepted events');
  }
  if (!gates.precisionAtLeast90 && precision != null) {
    blockers.push(`precision ${Math.round(precision * 1000) / 10}% below 90%`);
  }

  return {
    events,
    uniqueEmailsProducingEvents: Object.keys(eventsPerEmail).length,
    eventsPerEmail,
    roundupEmails,
    singleEventEmails,
    duplicateClusters,
    invalidEvents,
    categoryCounts,
    precision,
    gates,
    passed: blockers.length === 0,
    blockers,
  };
}
