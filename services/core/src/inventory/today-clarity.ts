/**
 * Today workbench clarity — eligibility, consistency, lanes, primary actions.
 * Reuses Home showroom lanes + eligibility. Does not invent a second scoring system.
 */

import type { InventoryItem } from './normalize.js';
import { resolveDisplayTitleFromRecord } from '../display-title/index.js';
import { isGenericFallbackWhyItMatters } from './normalize.js';
import { evaluateHomeEligibility } from './home-eligibility.js';
import { isAudienceFreshContent } from './content-freshness.js';
import { isOperatorTemporallyCurrent } from '../creator-agent/stale-temporal-prose.js';
import { isShoppingRetailContent } from './content-framing.js';
import {
  classifyContentLanes,
  hasKellieCreatorFit,
  isGenericSponsorPlaceholder,
  isLocalNewsWithoutCreatorFit,
  isOrdinaryPublicEvent,
  qualifiesFilmThis,
  qualifiesThingsToDoWeekly,
  type ContentLane,
} from '../pre-alpha/home-showroom-lanes.js';
import {
  coverageFormatLabel,
  recommendCoverageFormat,
  type CoverageFormat,
} from '../coverage-format/index.js';

export type TodayLane =
  | 'things_to_do_weekly'
  | 'film_this'
  | 'weekend_content'
  | 'sponsor_partnership'
  | 'follow_up'
  | 'source_intelligence_only'
  | 'watch_research';

export type TodayPrimaryActionKind =
  | 'plan_weekend'
  | 'plan_today'
  | 'add_things_to_do'
  | 'film_this'
  | 'review_pitch'
  | 'follow_up'
  | 'open_details';

export type TodayPrimaryAction = {
  kind: TodayPrimaryActionKind;
  label: string;
  /** Planner quick-action when applicable. */
  plannerAction: 'plan_weekend' | 'plan_today' | 'plan_this_week' | 'save' | null;
};

export type TodayClarityCardFields = {
  displayTitle: string;
  lane: TodayLane;
  laneLabel: string;
  whySummary: string;
  whenLabel: string | null;
  whereLabel: string | null;
  primaryAction: TodayPrimaryAction;
  coverageFormatLabel: string | null;
  showMarkCovered: boolean;
  showSave: boolean;
  viewSourceUrl: string | null;
};

const SEO_TITLE_RE =
  /\b(tickets?,?\s*info,?\s*reviews|videos?\s+and\s+more|tour\s+dates?\s*\|)|\|\s*(ticketmaster|stubhub|seatgeek)\b/i;

const ENTITY_STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'in',
  'at',
  'of',
  'to',
  'a',
  'an',
  'kc',
  'kansas',
  'city',
  'mo',
  'missouri',
  '2026',
  '2027',
  '2025',
  'live',
  'event',
  'events',
  'tickets',
  'info',
  'reviews',
  'videos',
  'more',
  'official',
  'website',
]);

export function isSeoSearchResultTitle(title: string): boolean {
  const t = title.trim();
  if (SEO_TITLE_RE.test(t)) return true;
  if (/\btickets?,?\s*info,?\s*reviews,?\s*videos\b/i.test(t)) return true;
  if ((t.match(/\|/g) ?? []).length >= 1 && /\b(tickets|tour dates|seatgeek|stubhub)\b/i.test(t)) {
    return true;
  }
  return false;
}

function tokenizeEntity(value: string): Set<string> {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !ENTITY_STOP.has(t));
  return new Set(tokens);
}

function entityOverlap(a: string, b: string): number {
  const ta = tokenizeEntity(a);
  const tb = tokenizeEntity(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return hit / Math.min(ta.size, tb.size);
}

/** Title / business / source must describe the same logical discovery. */
export function evaluateSourceEntityConsistency(item: InventoryItem): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const title = (item.title ?? '').trim();
  const business = (item.businessName ?? '').trim();
  const sourceName = (item.sourceName ?? '').trim();
  const why = item.whyItMatters ?? '';

  if (isGenericSponsorPlaceholder(item)) {
    reasons.push('generic_sponsor_placeholder');
  }

  // Shopping/gift-card angle on a concert/live SEO page without shared entity.
  const shoppingAngle =
    isShoppingRetailContent(item.flags, item.category, title) ||
    /deal haul|gift-card sponsorship|store opening/i.test(why);
  const concertish =
    isOrdinaryPublicEvent(item) ||
    /\b(live\s+in|concert|tour|tickets)\b/i.test(title) ||
    isSeoSearchResultTitle(title);

  if (shoppingAngle && concertish && business) {
    if (entityOverlap(title, business) < 0.34) {
      reasons.push('title_business_mismatch');
    }
  }

  if (business && isSeoSearchResultTitle(title) && entityOverlap(title, business) < 0.34) {
    reasons.push('seo_title_business_mismatch');
  }

  if (sourceName && business && shoppingAngle && concertish) {
    if (entityOverlap(title, sourceName) < 0.25 && entityOverlap(business, sourceName) < 0.34) {
      reasons.push('source_entity_mismatch');
    }
  }

  // Source name looks like a retail brand while title is an unrelated SEO live listing.
  if (
    sourceName &&
    isSeoSearchResultTitle(title) &&
    /\b(nordstrom|rack|target|costco|walmart|saks)\b/i.test(sourceName) &&
    entityOverlap(title, sourceName) < 0.34
  ) {
    reasons.push('retail_source_seo_title_mismatch');
  }

  return { ok: reasons.length === 0, reasons };
}

export function canonicalTodayTitle(item: InventoryItem): string {
  return resolveDisplayTitleFromRecord({
    rawTitle: item.title ?? '',
    sourceName: item.sourceName,
    venueName: item.venue ?? item.locationName,
    sourceUrl: item.sourceUrl,
    summary: item.summary,
    metadata: item.metadata,
    officialName: item.businessName,
    businessName: item.businessName,
  }).displayTitle;
}

export function resolveTodayLane(
  item: InventoryItem,
  sectionHint?: 'postWeekend' | 'postToday' | 'contactBusinesses' | 'followUpsDue' | null,
  now: Date = new Date(),
): TodayLane {
  if (sectionHint === 'followUpsDue') return 'follow_up';
  // Section placement already passed weekend eligibility — keep lane aligned.
  if (sectionHint === 'postWeekend') return 'weekend_content';
  if (sectionHint === 'contactBusinesses') {
    if (item.businessName || item.venue) return 'sponsor_partnership';
  }
  if (sectionHint === 'postToday' && qualifiesFilmThis(item, now)) return 'film_this';
  if (qualifiesFilmThis(item, now)) return 'film_this';
  if (qualifiesThingsToDoWeekly(item, now)) return 'things_to_do_weekly';
  if (item.flags.sponsorFriendly || item.flags.businessOpening) {
    if (item.businessName || item.venue) return 'sponsor_partnership';
  }
  const lanes = classifyContentLanes(item, now);
  if (lanes.includes('film_this')) return 'film_this';
  if (lanes.includes('things_to_do_weekly')) return 'things_to_do_weekly';
  if (lanes.includes('source_intelligence_only')) return 'source_intelligence_only';
  return 'watch_research';
}

export function todayLaneLabel(lane: TodayLane): string {
  switch (lane) {
    case 'things_to_do_weekly':
      return 'Things To Do Weekly';
    case 'film_this':
      return 'Film This';
    case 'weekend_content':
      return 'Weekend Content';
    case 'sponsor_partnership':
      return 'Sponsor / Partnership';
    case 'follow_up':
      return 'Follow-up';
    case 'source_intelligence_only':
      return 'Source Intelligence';
    default:
      return 'Watch / Research';
  }
}

function hasConcreteEntity(item: InventoryItem): boolean {
  return Boolean(
    item.businessName?.trim() ||
      item.venue?.trim() ||
      item.locationName?.trim() ||
      (item.title?.trim().length ?? 0) >= 6,
  );
}

function isLifecycleCurrent(item: InventoryItem, now: Date = new Date()): boolean {
  const status = item.lifecycleStatus;
  if (status === 'expired' || status === 'archived') return false;
  if (item.eventDate) {
    return isOperatorTemporallyCurrent({
      startsAt: item.eventDate,
      endsAt: item.eventEndDate,
      now,
      summaryText: item.summaryRaw ?? item.summary,
    });
  }
  return true;
}

/** Stricter than Discover / Home-eligible alone. */
export function passesTodayEligibility(
  item: InventoryItem,
  now: Date = new Date(),
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const home = evaluateHomeEligibility(item, now);
  if (!home.eligible) reasons.push(...home.reasons.filter((r) => r !== 'eligible'));
  if (!home.executableCta) reasons.push('invalid_cta_target');
  if (!isAudienceFreshContent(item, now)) reasons.push('stale_audience');
  if (!isLifecycleCurrent(item, now)) reasons.push('lifecycle_not_current');
  if (!hasConcreteEntity(item)) reasons.push('no_concrete_entity');
  if (!hasKellieCreatorFit(item) && !qualifiesThingsToDoWeekly(item) && !item.flags.sponsorFriendly) {
    reasons.push('weak_kellie_relevance');
  }
  if (isLocalNewsWithoutCreatorFit(item)) reasons.push('source_intelligence_only');
  if (isGenericSponsorPlaceholder(item)) reasons.push('generic_sponsor_placeholder');

  // Article = source intelligence unless converted into a concrete current opportunity.
  if (isEditorialArticleItem(item) && !hasConcreteDerivedOpportunity(item, now)) {
    reasons.push('editorial_source_intelligence_only');
  }
  if (!hasSpecificTodayReason(item)) {
    reasons.push('no_specific_today_reason');
  }

  const consistency = evaluateSourceEntityConsistency(item);
  if (!consistency.ok) reasons.push(...consistency.reasons);

  const lane = resolveTodayLane(item, undefined, now);
  if (lane === 'source_intelligence_only' || lane === 'watch_research') {
    // Source intel / vague watchlist does not belong on Today as an action card.
    if (!item.flags.sponsorFriendly || !item.businessName) {
      reasons.push('no_today_lane');
    }
  }

  return { ok: reasons.length === 0, reasons };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getWeekendRange(now: Date): { start: Date; end: Date } {
  const today = startOfDay(now);
  const weekday = today.getDay();
  const friday = new Date(today);
  if (weekday === 0) friday.setDate(friday.getDate() - 2);
  else if (weekday === 6) friday.setDate(friday.getDate() - 1);
  else if (weekday >= 1 && weekday <= 4) friday.setDate(friday.getDate() + (5 - weekday));
  const sunday = new Date(friday);
  sunday.setDate(sunday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);
  return { start: friday, end: sunday };
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isWeekendEvent(iso: string | null, now: Date): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  const { start, end } = getWeekendRange(now);
  return d >= start && d <= end;
}

function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function isWithinDays(iso: string | null, now: Date, days: number): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  const delta = daysBetween(now, d);
  return delta >= 0 && delta <= days;
}

/**
 * Weekend Content = filmable/postable for Fri–Sun — not ordinary concerts alone,
 * not generic shopping hypotheses, not source-intel news.
 */
export function isEligibleWeekendContent(item: InventoryItem, now: Date = new Date()): boolean {
  const base = passesTodayEligibility(item, now);
  if (!base.ok) return false;

  // Ordinary concert / public event → Things To Do Weekly, never Weekend Content.
  if (isOrdinaryPublicEvent(item)) return false;
  if (isLocalNewsWithoutCreatorFit(item)) return false;
  if (isGenericSponsorPlaceholder(item)) return false;
  if (isEditorialArticleItem(item) && !hasConcreteDerivedOpportunity(item, now)) return false;
  if (!hasSpecificTodayReason(item)) return false;

  const weekendDated =
    isWeekendEvent(item.eventDate, now) ||
    (Boolean(item.eventDate) && isWeekendEvent(item.eventEndDate, now));

  const filmable = qualifiesFilmThis(item, now);
  const shoppingConcrete =
    isShoppingRetailContent(item.flags, item.category, item.title) &&
    Boolean(item.businessName?.trim()) &&
    !isSeoSearchResultTitle(item.title) &&
    !isGenericSponsorPlaceholder(item);

  const dateNightDining =
    (item.flags.dateNight || item.flags.dining || item.flags.luxury) &&
    (weekendDated || isWithinDays(item.eventDate, now, 7));

  if (!filmable && !shoppingConcrete && !dateNightDining) return false;

  // Must be relevant to this weekend window somehow.
  if (!weekendDated && !dateNightDining && !(shoppingConcrete && isWithinDays(item.eventDate, now, 7))) {
    // Allow open-now shopping/openings without a hard date only when filmable + strong fit.
    if (!(filmable && (item.flags.businessOpening || shoppingConcrete))) return false;
  }

  return true;
}

/** Ordinary concerts may still qualify for Things To Do Weekly via lane authority. */
export function isEligibleThingsToDoToday(item: InventoryItem, now: Date = new Date()): boolean {
  if (!qualifiesThingsToDoWeekly(item, now)) return false;
  if (!isAudienceFreshContent(item, now)) return false;
  if (!isLifecycleCurrent(item, now)) return false;
  const consistency = evaluateSourceEntityConsistency(item);
  if (!consistency.ok) return false;
  return true;
}

export function recommendTodayPrimaryAction(
  item: InventoryItem,
  lane: TodayLane,
): TodayPrimaryAction {
  switch (lane) {
    case 'weekend_content':
      return { kind: 'plan_weekend', label: 'Plan for weekend', plannerAction: 'plan_weekend' };
    case 'things_to_do_weekly':
      return { kind: 'add_things_to_do', label: 'Add to Things To Do', plannerAction: 'plan_this_week' };
    case 'film_this':
      return { kind: 'film_this', label: 'Add to filming', plannerAction: 'plan_today' };
    case 'sponsor_partnership':
      return { kind: 'review_pitch', label: 'Review pitch', plannerAction: null };
    case 'follow_up':
      return { kind: 'follow_up', label: 'Follow up', plannerAction: null };
    default:
      return { kind: 'open_details', label: 'Details', plannerAction: null };
  }
}

function formatWhenLabel(item: InventoryItem): string | null {
  if (!item.eventDate) return null;
  try {
    const d = new Date(item.eventDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Chicago',
    });
  } catch {
    return null;
  }
}

function formatWhereLabel(item: InventoryItem): string | null {
  const parts = [item.venue, item.businessName, item.neighborhood, item.locationName]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  if (parts.length === 0) return null;
  // De-dupe near-identical
  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.some((u) => u.toLowerCase() === p.toLowerCase())) unique.push(p);
  }
  return unique.slice(0, 2).join(' · ');
}

const FRAMING_TEMPLATE_WHY_RE =
  /shopping\/retail discovery — deal haul|date-night or premium experience|dining or food opening — timely|community event — high engagement/i;

const EDITORIAL_SOURCE_RE =
  /\b(the\s+pitch|pitch\s+food|pitch\s+weekly|pitchkc|inkansas\s*city|kc\s*sipps|column)\b/i;

const EDITORIAL_HEADLINE_RE =
  /^(drink\s+this\s+now|the\s+in-betweeners|how\s+\w.+\bis\s+ushering|where\s+to\s+eat|eat,?\s*shop,?\s*play|rails,?\s*rides|opinion:|review:|column:|feature:)/i;

const WORTH_FILMING_GENERIC_RE =
  /worth\s+filming|concrete\s+place\s+to\s+shoot|strong\s+kellie\s+audience\s+fit\s+with\s+a\s+concrete|filmable this fri|strong weekend content fit/i;

const SPECIFIC_CURRENT_REASON_RE =
  /\b(new\s+(summer\s+)?(menu|cocktail|drink|opening|popup|pop[- ]?up)|grand\s+opening|soft\s+opening|just\s+opened|opens?\s+(this|on|fri|sat|sun|weekend)|launched|limited[- ]time|weekend\s+(special|menu|hours)|first\s+look|tasting\s+menu|ribbon\s+cutting|now\s+open)\b/i;

export function validViewSourceUrl(url: string | null | undefined): string | null {
  const u = url?.trim() ?? '';
  if (!u) return null;
  if (!(u.startsWith('http://') || u.startsWith('https://'))) return null;
  return u;
}

/**
 * Source articles / columns are intelligence, not automatic Today opportunities.
 * Pitch Food & Drink headlines are the canonical regression class.
 */
export function isEditorialArticleItem(
  item: Pick<InventoryItem, 'title' | 'sourceName' | 'ingest' | 'summary' | 'category'>,
): boolean {
  const title = (item.title ?? '').trim();
  const source = `${item.sourceName ?? ''} ${item.ingest ?? ''} ${item.category ?? ''}`;
  if (EDITORIAL_SOURCE_RE.test(source)) return true;
  if (EDITORIAL_HEADLINE_RE.test(title)) return true;
  // Long journalism-style headline with colon + question / essay framing.
  if (/^.+:\s+.+\?\s*$/.test(title) && title.length > 40) return true;
  if (/\bis\s+ushering\s+in\b|\bnext\s+era\s+as\s+a\b/i.test(title)) return true;
  return false;
}

export function isEditorialHeadlineTitle(title: string): boolean {
  const t = title.trim();
  return EDITORIAL_HEADLINE_RE.test(t) || /^.+:\s+.+\?\s*$/.test(t);
}

export function hasSpecificTodayReason(item: Pick<InventoryItem, 'whyItMatters' | 'title' | 'summary'>): boolean {
  const raw = (item.whyItMatters ?? '').trim();
  if (!raw) return false;
  if (isGenericFallbackWhyItMatters(raw)) return false;
  if (isGenericSponsorPlaceholder({ title: item.title, summary: item.summary, whyItMatters: raw, businessName: null })) {
    return false;
  }
  if (FRAMING_TEMPLATE_WHY_RE.test(raw)) return false;
  if (WORTH_FILMING_GENERIC_RE.test(raw)) return false;
  // Must cite a concrete cue, not vague fit language.
  if (SPECIFIC_CURRENT_REASON_RE.test(raw)) return true;
  if (
    /\b(sponsor|hotel\s+offer|member\s+save|grand\s+opening|estate\s+sale|gift\s+card|named business with a concrete sponsor)\b/i.test(
      raw,
    ) &&
    raw.length <= 180
  ) {
    return true;
  }
  // Short, non-template why that names a concrete subject can pass.
  if (raw.length <= 160 && !/audience fit|concrete place|worth filming|filmable this fri/i.test(raw)) {
    return /\b(cover|visit|pitch|menu|opening|sale|event|offer|cocktail|dining)\b/i.test(raw);
  }
  return false;
}

/** Concrete current opportunity derived FROM an article — not the article itself. */
export function hasConcreteDerivedOpportunity(item: InventoryItem, now: Date = new Date()): boolean {
  const business = (item.businessName ?? '').trim();
  const venue = (item.venue ?? '').trim();
  const place = business || venue;
  if (!place) return false;
  if (!validViewSourceUrl(item.sourceUrl)) return false;

  // Title must be the opportunity subject, not the raw editorial headline.
  if (isEditorialHeadlineTitle(item.title) || EDITORIAL_HEADLINE_RE.test(item.title)) {
    return false;
  }
  // Title should reference the place or be a short canonical opportunity name.
  const titleMentionsPlace =
    entityOverlap(item.title, place) >= 0.34 ||
    item.title.toLowerCase().includes(place.toLowerCase().slice(0, Math.min(12, place.length)));
  if (!titleMentionsPlace && item.title.length > 48) return false;

  const why = (item.whyItMatters ?? '').trim();
  if (!hasSpecificTodayReason(item)) return false;

  // Current evidence — not merely that an article once discussed the place.
  const currentSignal =
    item.flags.businessOpening ||
    SPECIFIC_CURRENT_REASON_RE.test(why) ||
    SPECIFIC_CURRENT_REASON_RE.test(`${item.title} ${item.summary ?? ''}`) ||
    (Boolean(item.eventDate) && isWithinDays(item.eventDate, now, 14));
  if (!currentSignal) return false;

  if (!isLifecycleCurrent(item, now)) return false;
  return true;
}

/**
 * Operator-facing why — never invent generic “worth filming” filler.
 * If evidence cannot support a specific reason, eligibility must exclude the item.
 */
export function synthesizeTodayWhy(item: InventoryItem, _lane: TodayLane): string {
  const raw = (item.whyItMatters ?? '').trim();
  if (hasSpecificTodayReason(item)) {
    if (raw.length <= 180) return raw;
    return `${raw.slice(0, 179).trim()}…`;
  }
  // Should not surface on Today; keep honest for tests/debug.
  return 'No specific current coverage reason from evidence.';
}

/** Concise operator-facing details — never dump article body. */
export function buildTodayDetailsSummary(item: InventoryItem, lane: TodayLane): string {
  const why = synthesizeTodayWhy(item, lane);
  const place = formatWhereLabel(item);
  const when = formatWhenLabel(item);
  const bits = [
    why,
    place ? `Where: ${place}` : null,
    when ? `When: ${when}` : null,
    item.businessName?.trim() ? `Business: ${item.businessName.trim()}` : null,
    item.sourceName?.trim() ? `Source: ${item.sourceName.trim()}` : null,
  ].filter(Boolean) as string[];
  return bits.join('\n');
}

/** Truncate article-body dumps for inventory Details. */
export function operatorFacingInventorySummary(
  summary: string | null | undefined,
  whyItMatters: string | null | undefined,
  maxChars = 360,
): string {
  const why = (whyItMatters ?? '').trim();
  const raw = (summary ?? '').trim();
  if (!raw) return why || 'No short summary — use View source for the full article.';
  const looksLikeArticleBody =
    raw.length > 500 ||
    (raw.match(/\n/g) ?? []).length >= 4 ||
    /\b(advertisement|subscribe|newsletter|related\s+stories|continue\s+reading)\b/i.test(raw);
  if (looksLikeArticleBody) {
    if (why && !WORTH_FILMING_GENERIC_RE.test(why) && why.length <= 220) {
      return why;
    }
    const first = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean)[0] ?? raw;
    return first.length > maxChars ? `${first.slice(0, maxChars - 1).trim()}…` : first;
  }
  if (raw.length > maxChars) return `${raw.slice(0, maxChars - 1).trim()}…`;
  return raw;
}

export function recommendTodayCoverageLabel(item: InventoryItem): string | null {
  if (item.coverageFormat) {
    return coverageFormatLabel(item.coverageFormat as CoverageFormat);
  }
  const suggested =
    (item.suggestedCoverageFormat as CoverageFormat | null | undefined) ??
    recommendCoverageFormat({
      title: item.title,
      summary: item.summary,
      category: item.category,
      eventStartsAt: item.eventDate ? new Date(item.eventDate) : null,
      locationName: item.locationName ?? item.venue,
      sourceUrl: item.sourceUrl,
      firsthandVisited: item.firsthandVisited,
    });
  return coverageFormatLabel(suggested);
}

export function shouldShowMarkCovered(item: InventoryItem, lane: TodayLane): boolean {
  if (lane === 'film_this' || lane === 'weekend_content') return true;
  if (item.coverageFormat && item.coverageFormat !== 'track_only') return true;
  return false;
}

export function buildTodayClarityFields(
  item: InventoryItem,
  sectionHint?: 'postWeekend' | 'postToday' | 'contactBusinesses' | 'followUpsDue' | null,
  now: Date = new Date(),
): TodayClarityCardFields {
  const lane = resolveTodayLane(item, sectionHint, now);
  return {
    displayTitle: canonicalTodayTitle(item),
    lane,
    laneLabel: todayLaneLabel(lane),
    whySummary: synthesizeTodayWhy(item, lane),
    whenLabel: formatWhenLabel(item),
    whereLabel: formatWhereLabel(item),
    primaryAction: recommendTodayPrimaryAction(item, lane),
    coverageFormatLabel: recommendTodayCoverageLabel(item),
    showMarkCovered: shouldShowMarkCovered(item, lane),
    showSave: false, // inventory items are already durable
    viewSourceUrl: validViewSourceUrl(item.sourceUrl),
  };
}

/** Prefer one canonical Today placement; first section in order wins. */
export function dedupeTodaySectionIds(
  sectionOrder: string[],
  sections: Record<string, { items: Array<{ id: string }> }>,
): void {
  const seen = new Set<string>();
  for (const key of sectionOrder) {
    const section = sections[key];
    if (!section) continue;
    section.items = section.items.filter((card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
  }
}

export type { ContentLane };
