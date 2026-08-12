/**
 * Things To Do This Weekend in KC — curated shortlist from durable inventory.
 * Separate from Film This / Home Best Move. Reuses planner Weekend board for selection.
 */

import { getCreatorTimezone, getLocalCalendarDay } from '../datetime.js';
import { loadIngestedInventoryItems, type InventoryItem } from '../inventory/index.js';
import { isAudienceFreshContent } from '../inventory/content-freshness.js';
import { isEditorialArticleItem, validViewSourceUrl } from '../inventory/today-clarity.js';
import {
  isOrdinaryPublicEvent,
  qualifiesFilmThis,
  qualifiesThingsToDoWeekly,
} from '../pre-alpha/home-showroom-lanes.js';
import { isEmploymentOpportunity } from '../creator-agent/employment-intent.js';
import { loadByBoard, upsertPlannerItem } from '../content-planner/items.js';
import { loadSkippedContentIdsForItems } from '../creator-skip/index.js';
import { isOperatorTemporallyCurrent } from '../creator-agent/stale-temporal-prose.js';

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const POLITICAL_CIVIC_EXCLUDE_RE =
  /\b(democratic|republican|gop|democrat|political\s+party|party\s+banquet|fundraiser|campaign\s+dinner|pac\b|primary\s+election|general\s+election)\b/i;

const PRIVATE_MEMBER_RE =
  /\b(members?\s+only|private\s+event|invitation\s+only|invite[- ]only|closed\s+to\s+public)\b/i;

const GENERIC_CONFERENCE_RE =
  /\b(conference|symposium|summit|trade\s+show|expo)\b/i;

const SEO_LISTING_RE =
  /\b(tickets?,?\s*info|tour\s+dates?\s*\| |\|\s*ticketmaster|events?\s+in\s+\w+\s*—)/i;

const KC_METRO_RE =
  /\b(kansas\s*city|kc\b|overland\s+park|leawood|lenexa|olathe|independence|missouri|johnson\s+county|wyandotte|plaza|westport|river\s*market|power\s*(?:and|&)\s*light|northland|liberty|shawnee|prairie\s+village|mission\s+hills?)\b/i;

type VarietyBucket =
  | 'festival'
  | 'food_drink'
  | 'shopping_market'
  | 'family'
  | 'date_night'
  | 'experience'
  | 'entertainment'
  | 'other';

export type WeekendThingsToDoPick = {
  id: string;
  title: string;
  whenLabel: string | null;
  whereLabel: string | null;
  whySummary: string;
  sourceName: string | null;
  sourceUrl: string | null;
  viewSourceUrl: string | null;
  category: string | null;
  categoryLabel: string;
  varietyBucket: VarietyBucket;
  selected: boolean;
  qualifiesFilmThis: boolean;
  eventDate: string | null;
};

export type WeekendThingsToDoResponse = {
  weekendLabel: string;
  friday: string;
  sunday: string;
  timezone: string;
  count: number;
  selectedCount: number;
  emptyReason: string | null;
  items: WeekendThingsToDoPick[];
};

function chicagoWeekday(now: Date, timezone: string): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(now);
  return WEEKDAY_SHORT[short] ?? 0;
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + deltaDays, 12));
  return utc.toISOString().slice(0, 10);
}

/** Current Fri–Sun window in America/Chicago (or creator TZ). */
export function getChicagoWeekendDayKeys(now: Date = new Date()): {
  friday: string;
  saturday: string;
  sunday: string;
  timezone: string;
  label: string;
} {
  const timezone = getCreatorTimezone();
  const todayKey = getLocalCalendarDay(now, timezone);
  const weekday = chicagoWeekday(now, timezone);
  let deltaToFriday = 5 - weekday;
  if (weekday === 0) deltaToFriday = -2;
  else if (weekday === 6) deltaToFriday = -1;
  const friday = shiftDayKey(todayKey, deltaToFriday);
  const saturday = shiftDayKey(friday, 1);
  const sunday = shiftDayKey(friday, 2);
  const friLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${friday}T12:00:00Z`));
  const sunLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${sunday}T12:00:00Z`));
  return {
    friday,
    saturday,
    sunday,
    timezone,
    label: `Fri–Sun · ${friLabel}–${sunLabel}`,
  };
}

export function eventFallsInChicagoWeekend(
  eventDate: string | null,
  eventEndDate: string | null,
  now: Date = new Date(),
): boolean {
  const { friday, sunday, timezone } = getChicagoWeekendDayKeys(now);
  const days = [eventDate, eventEndDate].filter(Boolean) as string[];
  for (const iso of days) {
    const key = getLocalCalendarDay(new Date(iso), timezone);
    if (key >= friday && key <= sunday) return true;
  }
  return false;
}

export function isPoliticalCivicBanquet(
  item: Pick<InventoryItem, 'title' | 'summary' | 'whyItMatters' | 'category'>,
): boolean {
  const hay = `${item.title} ${item.summary ?? ''} ${item.whyItMatters ?? ''} ${item.category ?? ''}`;
  if (POLITICAL_CIVIC_EXCLUDE_RE.test(hay)) return true;
  if (/\bbanquet\b/i.test(hay) && /\b(democrat|republican|political|party)\b/i.test(hay)) return true;
  return false;
}

export function isPrivateOrMemberOnly(
  item: Pick<InventoryItem, 'title' | 'summary' | 'whyItMatters'>,
): boolean {
  const hay = `${item.title} ${item.summary ?? ''} ${item.whyItMatters ?? ''}`;
  return PRIVATE_MEMBER_RE.test(hay);
}

function hasConcreteVenue(item: InventoryItem): boolean {
  return Boolean(
    item.venue?.trim() ||
      item.locationName?.trim() ||
      item.businessName?.trim() ||
      item.formattedAddress?.trim() ||
      item.neighborhood?.trim(),
  );
}

function isKcMetroRelevant(item: InventoryItem): boolean {
  const hay = [
    item.title,
    item.summary,
    item.venue,
    item.locationName,
    item.businessName,
    item.neighborhood,
    item.formattedAddress,
    item.sourceName,
  ]
    .filter(Boolean)
    .join(' ');
  if (KC_METRO_RE.test(hay)) return true;
  if (
    /\b(kc\s*parks|visit\s*kc|the\s+pitch|united\s+way|power\s*(?:and|&)\s*light|boulevard|816)\b/i.test(
      item.sourceName ?? '',
    )
  ) {
    return true;
  }
  return false;
}

export function classifyVarietyBucket(item: InventoryItem): VarietyBucket {
  const hay = `${item.title} ${item.summary ?? ''} ${item.category ?? ''}`.toLowerCase();
  if (item.flags.freeEvent && /\b(fest|festival|fair|parade)\b/i.test(hay)) return 'festival';
  if (/\b(fest|festival|fair|parade|816\s*day)\b/i.test(hay)) return 'festival';
  if (item.flags.dining || item.flags.dateNight || /\b(food|drink|beer|wine|tasting|brunch|dinner)\b/i.test(hay)) {
    return item.flags.dateNight ? 'date_night' : 'food_drink';
  }
  if (item.flags.shopping || item.flags.retail || item.flags.vendorMarket || /\b(market|shop|boutique)\b/i.test(hay)) {
    return 'shopping_market';
  }
  if (/\b(kids?|family|children|frogs?|fish)\b/i.test(hay)) return 'family';
  if (isOrdinaryPublicEvent(item) || /\b(concert|tour|live\s+music|theatre|theater|comedy)\b/i.test(hay)) {
    return 'entertainment';
  }
  if (/\b(museum|gallery|experience|class|workshop|walk|tour)\b/i.test(hay)) return 'experience';
  return 'other';
}

function hasKellieAudienceFitLoose(item: InventoryItem): boolean {
  return Boolean(
    item.flags.dining ||
      item.flags.dateNight ||
      item.flags.shopping ||
      item.flags.freeEvent ||
      item.flags.luxury ||
      /\b(kc|kansas\s*city|family|food|shop|festival)\b/i.test(`${item.title} ${item.whyItMatters}`),
  );
}

/**
 * Things To Do weekend eligibility — intentionally allows ordinary concerts.
 * Does NOT imply Film This / Home Best Move.
 */
export function isEligibleThingsToDoWeekend(
  item: InventoryItem,
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  if (!item.eventDate) return { ok: false, reason: 'no_date' };
  if (
    !isOperatorTemporallyCurrent({
      startsAt: item.eventDate,
      endsAt: item.eventEndDate,
      summaryText: item.summaryRaw ?? item.summary,
    })
  ) {
    return { ok: false, reason: 'stale' };
  }
  if (!isAudienceFreshContent(item, now)) return { ok: false, reason: 'stale_freshness' };
  if (!eventFallsInChicagoWeekend(item.eventDate, item.eventEndDate, now)) {
    return { ok: false, reason: 'outside_weekend' };
  }
  if (!validViewSourceUrl(item.sourceUrl)) return { ok: false, reason: 'no_source' };
  if (!hasConcreteVenue(item)) return { ok: false, reason: 'no_venue' };
  if (!isKcMetroRelevant(item)) return { ok: false, reason: 'outside_metro' };
  if (isEmploymentOpportunity(item)) return { ok: false, reason: 'employment' };
  if (isPoliticalCivicBanquet(item)) return { ok: false, reason: 'political_civic' };
  if (isPrivateOrMemberOnly(item)) return { ok: false, reason: 'private' };
  if (isEditorialArticleItem(item)) return { ok: false, reason: 'editorial_article' };
  if (/\bwork\s+in\s+progress\b/i.test(item.title)) {
    return { ok: false, reason: 'editorial_article' };
  }
  // Headline names a remote city while the venue is local (or empty) — not a KC weekend pick.
  const remoteCity =
    /\b(bangor|boston|chicago|nashville|austin|denver|seattle|atlanta|miami|brooklyn|manhattan|los\s+angeles|la\b)\b/i;
  const placeBlob = `${item.venue ?? ''} ${item.locationName ?? ''} ${item.formattedAddress ?? ''}`;
  if (remoteCity.test(item.title) && !remoteCity.test(placeBlob)) {
    return { ok: false, reason: 'remote_city_headline' };
  }
  if (SEO_LISTING_RE.test(item.title) && !hasConcreteVenue(item)) {
    return { ok: false, reason: 'seo_listing' };
  }
  if (GENERIC_CONFERENCE_RE.test(item.title) && !hasKellieAudienceFitLoose(item)) {
    return { ok: false, reason: 'generic_conference' };
  }

  const publicFacing =
    qualifiesThingsToDoWeekly(item) ||
    item.flags.freeEvent ||
    item.flags.dateNight ||
    item.flags.dining ||
    item.flags.vendorMarket ||
    /\b(fest|festival|market|fair|day|tour|show|tasting|brunch)\b/i.test(item.title);

  if (!publicFacing) return { ok: false, reason: 'not_public_facing' };
  return { ok: true };
}

function formatWhen(item: InventoryItem, timezone: string): string | null {
  if (!item.eventDate) return null;
  try {
    return new Date(item.eventDate).toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function formatWhere(item: InventoryItem): string | null {
  const parts = [item.venue, item.businessName, item.locationName, item.neighborhood]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.some((u) => u.toLowerCase() === p.toLowerCase())) unique.push(p);
  }
  return unique.slice(0, 2).join(' · ') || null;
}

function whySummary(item: InventoryItem): string {
  const raw = (item.whyItMatters ?? item.summary ?? '').trim();
  if (!raw) return 'Solid public KC weekend pick with a clear place and date.';
  const first = raw.split(/\n+/)[0]!.trim();
  return first.length > 140 ? `${first.slice(0, 139).trim()}…` : first;
}

function categoryLabel(item: InventoryItem, bucket: VarietyBucket): string {
  if (item.category?.trim()) return item.category.replace(/_/g, ' ');
  return bucket.replace(/_/g, ' ');
}

function normalizeTitleKey(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(
      /\b(performs?|concert|tour|live|tickets?|info|at|the|and|with|x|presents?|featuring|ft|vs)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => w.length > 1);
  // Two-token identity collapses "Artist", "Artist Live", "Artist performs at …".
  return words.slice(0, 2).join(' ');
}

/** One listing per event identity for the weekend shortlist (ignore day/place drift). */
function dedupeKey(item: InventoryItem): string {
  return normalizeTitleKey(item.title);
}

/** Prefer variety — cap entertainment/concerts. */
export function selectVariedWeekendPicks(
  candidates: Array<InventoryItem & { bucket: VarietyBucket }>,
  limit = 12,
): Array<InventoryItem & { bucket: VarietyBucket }> {
  const entertainmentCap = Math.max(2, Math.floor(limit / 3));
  const picked: Array<InventoryItem & { bucket: VarietyBucket }> = [];
  const seenBuckets = new Set<VarietyBucket>();
  let entertainment = 0;

  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (seenBuckets.has(c.bucket)) continue;
    if (c.bucket === 'entertainment' && entertainment >= entertainmentCap) continue;
    picked.push(c);
    seenBuckets.add(c.bucket);
    if (c.bucket === 'entertainment') entertainment += 1;
  }

  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (picked.some((p) => p.id === c.id)) continue;
    if (c.bucket === 'entertainment' && entertainment >= entertainmentCap) continue;
    picked.push(c);
    if (c.bucket === 'entertainment') entertainment += 1;
  }

  return picked;
}

function rankScore(item: InventoryItem, bucket: VarietyBucket): number {
  let score = item.audienceScore ?? 0;
  if (bucket === 'festival') score += 8;
  if (bucket === 'food_drink' || bucket === 'date_night') score += 6;
  if (bucket === 'family' || bucket === 'shopping_market') score += 5;
  if (bucket === 'entertainment') score += 2;
  if (item.flags.freeEvent) score += 3;
  if (validViewSourceUrl(item.sourceUrl)) score += 2;
  return score;
}

export async function computeWeekendThingsToDo(
  now: Date = new Date(),
): Promise<WeekendThingsToDoResponse> {
  const weekend = getChicagoWeekendDayKeys(now);
  const inventory = await loadIngestedInventoryItems();
  const skipped = await loadSkippedContentIdsForItems(inventory).catch(() => new Set<string>());
  const weekendBoard = await loadByBoard('Weekend').catch(() => []);
  const selectedIds = new Set(
    weekendBoard
      .filter((r) => r.status !== 'skipped' && r.status !== 'covered')
      .map((r) => r.contentItemId),
  );

  const eligible: Array<InventoryItem & { bucket: VarietyBucket; score: number }> = [];
  const seen = new Set<string>();

  for (const item of inventory) {
    if (skipped.has(item.id)) continue;
    const gate = isEligibleThingsToDoWeekend(item, now);
    if (!gate.ok) continue;
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = classifyVarietyBucket(item);
    eligible.push({ ...item, bucket, score: rankScore(item, bucket) });
  }

  eligible.sort((a, b) => b.score - a.score);
  const selected = selectVariedWeekendPicks(eligible, 12);

  const items: WeekendThingsToDoPick[] = selected.map((item) => ({
    id: item.id,
    title: item.title,
    whenLabel: formatWhen(item, weekend.timezone),
    whereLabel: formatWhere(item),
    whySummary: whySummary(item),
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    viewSourceUrl: validViewSourceUrl(item.sourceUrl),
    category: item.category,
    categoryLabel: categoryLabel(item, item.bucket),
    varietyBucket: item.bucket,
    selected: selectedIds.has(item.id),
    qualifiesFilmThis: qualifiesFilmThis(item),
    eventDate: item.eventDate,
  }));

  return {
    weekendLabel: weekend.label,
    friday: weekend.friday,
    sunday: weekend.sunday,
    timezone: weekend.timezone,
    count: items.length,
    selectedCount: items.filter((i) => i.selected).length,
    emptyReason:
      items.length === 0
        ? 'No strong Things To Do picks for this weekend yet — Benson will not fill the list with weak events.'
        : null,
    items,
  };
}

export async function setWeekendListMembership(
  contentItemId: string,
  selected: boolean,
): Promise<{ contentItemId: string; selected: boolean }> {
  if (selected) {
    await upsertPlannerItem(contentItemId, { action: 'plan_weekend' });
    return { contentItemId, selected: true };
  }
  await upsertPlannerItem(contentItemId, {
    listName: 'Saved For Later',
    status: 'saved',
  });
  return { contentItemId, selected: false };
}
