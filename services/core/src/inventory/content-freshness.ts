import type { InventoryItem } from './normalize.js';
import {
  isWorldCupSeasonActive,
  textHasWorldCupAngle,
  WORLD_CUP_TEXT_RE,
  textHasKcThriftToursAngle,
  isKcThriftToursEventDay,
} from './mega-events.js';

export {
  isWorldCupSeasonActive,
  textHasWorldCupAngle,
  WORLD_CUP_TEXT_RE,
  worldCupSeasonStatusLabel,
  textHasKcThriftToursAngle,
  isKcThriftToursEventDay,
  KC_THRIFT_TOURS_EVENT_DATE,
} from './mega-events.js';

export function isWorldCupFlaggedItem(
  item: Pick<InventoryItem, 'flags' | 'title' | 'category'>,
): boolean {
  return (
    item.flags.worldCup ||
    item.category === 'world_cup' ||
    textHasWorldCupAngle(item.title)
  );
}

/** World Cup angles are stale audience content after KC tournament matches end. */
export function isWorldCupAudienceStale(
  item: Pick<InventoryItem, 'flags' | 'title' | 'category'>,
  now = new Date(),
): boolean {
  return isWorldCupFlaggedItem(item) && !isWorldCupSeasonActive(now);
}

/** Live KC Thrift Tours party bus — boost on shoot day, decay after. */
export function kcThriftToursUrgencyBoost(
  item: Pick<InventoryItem, 'title' | 'eventDate'>,
  now = new Date(),
): number {
  if (!textHasKcThriftToursAngle(item.title)) return 0;
  const days = daysUntilEvent(item.eventDate, now);
  if (isKcThriftToursEventDay(now)) return 90;
  if (days != null) {
    if (days >= 0 && days <= 2) return 35;
    if (days < -1) return -40;
  }
  return 8;
}

/** Ranking penalty when World Cup hooks are no longer current (-60 after tournament). */
export function worldCupUrgencyBoost(
  item: Pick<InventoryItem, 'flags' | 'title' | 'category'>,
  now = new Date(),
): number {
  if (!isWorldCupFlaggedItem(item)) return 0;
  if (!isWorldCupSeasonActive(now)) return -60;
  return 4;
}

/** The Pitch "KC Sipps" weekly roundups — editorial, not a single sponsor target. */
export function isKcSippsRoundup(item: InventoryItem): boolean {
  if (/^KC Sipps:/i.test(item.title)) return true;
  if (/kc sipps/i.test(item.sourceName ?? '')) return true;
  return item.ingest === 'pitch_dining_rss' && /^KC Sipps:/i.test(item.title);
}

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Best estimate of when this opportunity was published or first ingested. */
export function contentPublishedAt(item: InventoryItem): Date | null {
  const pitch = item.metadata?.pitchDining as { publishedAt?: string } | undefined;
  return (
    parseIso(pitch?.publishedAt) ??
    parseIso(item.discoveredAt) ??
    parseIso(item.createdAt)
  );
}

export function contentAgeDays(item: InventoryItem, now = new Date()): number {
  const published = contentPublishedAt(item);
  if (!published) return 999;
  return Math.floor((now.getTime() - published.getTime()) / (24 * 60 * 60 * 1000));
}

const SEASONAL_TITLE_RULES: Array<{ pattern: RegExp; validMonths: number[] }> = [
  { pattern: /mother'?s day/i, validMonths: [4] },
  { pattern: /father'?s day/i, validMonths: [5] },
  { pattern: /pride month/i, validMonths: [5] },
  { pattern: /valentine/i, validMonths: [1] },
  { pattern: /thanksgiving/i, validMonths: [10] },
  { pattern: /christmas|holiday party|nye|new year'?s eve/i, validMonths: [11, 0] },
];

export function isSeasonallyStaleTitle(title: string, now = new Date()): boolean {
  const month = now.getMonth();
  for (const rule of SEASONAL_TITLE_RULES) {
    if (rule.pattern.test(title) && !rule.validMonths.includes(month)) {
      return true;
    }
  }
  return false;
}

const OPENING_CATEGORIES = new Set([
  'restaurant_opening',
  'coffee_opening',
  'business_opening',
  'boutique_opening',
  'retail_opening',
  'thrift_store',
]);

const GRAND_OPENING_TITLE_RE =
  /\b(grand opening|soft opening|ribbon cutting|now open|opening soon)\b/i;

export function isOpeningContent(item: InventoryItem): boolean {
  if (item.flags.businessOpening) return true;
  if (item.category && OPENING_CATEGORIES.has(item.category)) return true;
  return GRAND_OPENING_TITLE_RE.test(item.title);
}

export function daysUntilEvent(
  iso: string | null | undefined,
  now = new Date(),
): number | null {
  const event = parseIso(iso);
  if (!event) return null;
  return (event.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
}

/** Ranking penalty/bonus for openings — past grand openings sink fast. */
export function openingUrgencyBoost(item: InventoryItem, now = new Date()): number {
  if (!isOpeningContent(item)) return 0;

  const days = daysUntilEvent(item.eventDate, now);
  if (days != null) {
    if (days < -7) return -55;
    if (days < -1) return -45;
    if (days < 0) return -25;
    if (days <= 2) return 12;
    if (days <= 7) return 6;
    return 0;
  }

  const ageDays = contentAgeDays(item, now);
  if (GRAND_OPENING_TITLE_RE.test(item.title)) {
    if (ageDays > 14) return -50;
    if (ageDays > 7) return -35;
    if (ageDays > 3) return -15;
  }
  return 0;
}

type OpeningRankFields = {
  title: string;
  eventDate: string | Date | null;
  category?: string | null;
  discoveredAt?: string | null;
  createdAt?: string | null;
  businessOpening?: boolean;
};

/** Lightweight opening decay for scored rows (no full InventoryItem). */
export function openingUrgencyBoostFromFields(
  fields: OpeningRankFields,
  now = new Date(),
): number {
  const title = fields.title;
  const isOpening =
    fields.businessOpening === true ||
    (fields.category != null && OPENING_CATEGORIES.has(fields.category)) ||
    GRAND_OPENING_TITLE_RE.test(title);
  if (!isOpening) return 0;

  const eventIso =
    fields.eventDate instanceof Date
      ? fields.eventDate.toISOString()
      : fields.eventDate;
  const days = daysUntilEvent(eventIso, now);
  if (days != null) {
    if (days < -7) return -55;
    if (days < -1) return -45;
    if (days < 0) return -25;
    if (days <= 2) return 12;
    if (days <= 7) return 6;
    return 0;
  }

  if (!GRAND_OPENING_TITLE_RE.test(title)) return 0;
  const published =
    parseIso(fields.discoveredAt) ?? parseIso(fields.createdAt);
  if (!published) return -20;
  const ageDays = Math.floor((now.getTime() - published.getTime()) / (24 * 60 * 60 * 1000));
  if (ageDays > 14) return -50;
  if (ageDays > 7) return -35;
  if (ageDays > 3) return -15;
  return 0;
}

/**
 * Whether an item is still worth surfacing as "fresh" content for Kellie's audience.
 * Viewers want timely KC picks — not last month's Sipps roundup or past events.
 */
export function isAudienceFreshContent(item: InventoryItem, now = new Date()): boolean {
  if (isSeasonallyStaleTitle(item.title, now)) return false;
  if (isWorldCupAudienceStale(item, now)) return false;

  const event = parseIso(item.eventDate);
  const ageDays = contentAgeDays(item, now);

  if (isOpeningContent(item)) {
    const daysUntil = daysUntilEvent(item.eventDate, now);
    if (daysUntil != null && daysUntil < -1) return false;
    if (daysUntil == null && GRAND_OPENING_TITLE_RE.test(item.title) && ageDays > 10) {
      return false;
    }
  } else if (event && event.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    return false;
  }

  if (isKcSippsRoundup(item)) {
    return ageDays <= 21;
  }

  if (item.ingest === 'pitch_dining_rss') {
    return ageDays <= 30;
  }

  if (event) {
    const daysUntil = (event.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysUntil < -3) return false;
    return ageDays <= 60;
  }

  return ageDays <= 45;
}

/** Recency adjustment for ranking (-40 stale … +15 very fresh). */
export function audienceFreshnessBoost(item: InventoryItem, now = new Date()): number {
  if (!isAudienceFreshContent(item, now)) return -40;
  const ageDays = contentAgeDays(item, now);
  let boost = 0;
  if (ageDays <= 1) boost = 15;
  else if (ageDays <= 3) boost = 12;
  else if (ageDays <= 7) boost = 8;
  else if (ageDays <= 14) boost = 4;
  else if (ageDays <= 21) boost = 0;
  else boost = -8;
  return boost + openingUrgencyBoost(item, now) + worldCupUrgencyBoost(item, now) + kcThriftToursUrgencyBoost(item, now);
}

/** Sipps roundups are editorial — not valid single-business sponsor outreach targets. */
export function isSponsorOutreachTarget(item: InventoryItem, now = new Date()): boolean {
  if (isKcSippsRoundup(item)) return false;
  if (!isAudienceFreshContent(item, now)) return false;
  return true;
}
