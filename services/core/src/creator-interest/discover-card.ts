/**
 * Discover card copy, traits, and ranking — Discover feed only.
 */
import { decodeEntities } from '../creator-skip/index.js';
import { isOpaqueContentId } from '../ask-benson/url-type.js';
import { isKcMetroLocation } from '../ask-benson/url-geo.js';
import {
  LISTING_EVENT_CATEGORIES,
  resolveListingEventCategory,
} from '../ask-benson/listing-event-category.js';
import {
  discoverPreferenceFit,
  type DiscoverTasteWeights,
} from '../creator-preferences/discover-taste.js';
import {
  discoverPrimaryActionForState,
  discoverTrustLabel,
  evaluateDiscoverTrust,
  looksLikeRawScraperText,
} from './discover-trust.js';
import { resolveDisplayTitleFromRecord } from '../display-title/index.js';

export type DiscoverPrimaryActionKey = 'post_now' | 'pitch' | 'save' | 'skip';

export type DiscoverPrimaryAction = {
  key: DiscoverPrimaryActionKey;
  label: string;
};

export type DiscoverCardModel = {
  title: string;
  subtitle: string | null;
  whyItMatters: string;
  opportunityKind: string;
  whereWhen: string | null;
  confidenceLabel: string;
  primaryAction: DiscoverPrimaryAction;
  traits: string[];
  rankScore: number;
};

export type DiscoverCardSource = {
  title: string;
  summary?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  category?: string | null;
  sourceUrl?: string | null;
  eventStartsAt?: Date | string | null;
  discoveredAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
};

const FOOD_RE =
  /\b(restaurant|menu|dining|brunch|coffee|caf[eé]|bakery|food|taco|pizza|bbq|happy hour)\b/i;
const SHOPPING_RE = /\b(thrift|consignment|bargain|boutique|retail|vintage|market|sale|shopping)\b/i;
const NIGHTLIFE_RE = /\b(\bdjs?\b|nightlife|nightclub|dance party|club night)\b/i;
const LITERARY_RE = /\b(book|reading|literary|author|poetry|cookbook club)\b/i;
const DATE_NIGHT_RE = /\b(date night|couples)\b/i;
const FESTIVAL_RE = /\b(fest|festival)\b/i;
const OPENING_RE = /\b(grand opening|now open|new opening|just opened|opening soon)\b/i;
const CREATOR_RE =
  /\b(creator\s+program|affiliate|brand\s+ambassador|ugc|creator_partnership|creator partnership)\b/i;
const SPONSOR_RE = /\b(sponsor|sponsorship)\b/i;
const FILMING_RE = /\b(filming|shoot|b-roll)\b/i;

const NEIGHBORHOODS: Array<{ trait: string; re: RegExp }> = [
  { trait: 'kc_westport', re: /\bwestport\b/i },
  { trait: 'kc_crossroads', re: /\bcrossroads\b/i },
  { trait: 'kc_plaza', re: /\b(country club )?plaza\b/i },
  { trait: 'kc_river_market', re: /\briver market\b/i },
  { trait: 'kc_northland', re: /\bnorthland\b/i },
  { trait: 'kc_overland_park', re: /\boverland park\b/i },
  { trait: 'kc_lenexa', re: /\blenexa\b/i },
];

function listingOf(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const listing = meta?.listingScrape;
  return listing && typeof listing === 'object' && !Array.isArray(listing)
    ? (listing as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function blobOf(input: DiscoverCardSource): string {
  const listing = listingOf(input.metadata);
  return [
    input.title,
    input.summary,
    input.locationName,
    input.category,
    str(input.metadata?.entityOpportunityType),
    str(input.metadata?.opportunityCategory),
    str(listing.businessName),
  ]
    .filter(Boolean)
    .join('\n');
}

function categoryKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim().replace(/[\s/-]+/g, '_');
}

export function extractDiscoverTraits(input: DiscoverCardSource): string[] {
  const blob = blobOf(input);
  const cat = categoryKey(input.category) || categoryKey(str(input.metadata?.entityOpportunityType));
  const traits = new Set<string>();

  if (FOOD_RE.test(blob) || /restaurant|food_drink|dining/.test(cat)) traits.add('food_drink');
  if (SHOPPING_RE.test(blob) || /shopping|thrift|bargain|boutique|retail/.test(cat)) {
    traits.add('shopping_bargain');
  }
  if (NIGHTLIFE_RE.test(blob) || /nightlife/.test(cat)) traits.add('nightlife');
  if (LITERARY_RE.test(blob)) traits.add('literary_event');
  if (DATE_NIGHT_RE.test(blob) || /date_night/.test(cat)) traits.add('date_night');
  if (FESTIVAL_RE.test(blob) || /festival/.test(cat)) traits.add('festival');
  if (OPENING_RE.test(blob) || /opening/.test(cat)) traits.add('new_opening');
  if (CREATOR_RE.test(blob) || /creator_partnership|affiliate/.test(cat)) traits.add('creator_program');
  if (SPONSOR_RE.test(blob) && !CREATOR_RE.test(blob)) traits.add('sponsor');
  if (FILMING_RE.test(blob)) traits.add('filming');
  if (input.eventStartsAt) traits.add('event');

  for (const { trait, re } of NEIGHBORHOODS) {
    if (re.test(blob)) traits.add(trait);
  }

  return [...traits];
}

function isInternalGarbage(text: string): boolean {
  return /creator_candidate|likely brand slug|kc discovery|restaurant \/ food discovery/i.test(text);
}

function collapseDuplicateTitle(title: string): string {
  const parts = title.split(/\s+[|—–]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
    const last = parts[parts.length - 1]!;
    if (parts[0]!.toLowerCase().includes(last.toLowerCase()) || last.toLowerCase().includes(parts[0]!.toLowerCase())) {
      return parts[0]!;
    }
  }
  return title;
}

export function discoverDisplayTitle(input: DiscoverCardSource): string {
  return resolveOpportunityDisplay(input).displayTitle;
}

export function resolveOpportunityDisplay(input: DiscoverCardSource) {
  const listing = listingOf(input.metadata);
  const resolved = resolveDisplayTitleFromRecord({
    rawTitle: input.title ?? '',
    venueName: input.locationName,
    sourceUrl: input.sourceUrl,
    summary: input.summary,
    metadata: (input.metadata ?? null) as Record<string, unknown> | null,
  });
  const cleaned = resolved.displayTitle.replace(/\s+at\s+instagram$/i, '').trim() || resolved.displayTitle;
  if (cleaned && !isOpaqueContentId(cleaned) && !isInternalGarbage(cleaned)) {
    return { ...resolved, displayTitle: cleaned };
  }
  const business = str(listing.businessName).trim();
  if (business && !isOpaqueContentId(business) && business.length >= 4 && !isInternalGarbage(business)) {
    const decoded = decodeEntities(business);
    if (!/tiktok,\s*instagram/i.test(decoded) && !looksLikeRawScraperText(decoded)) {
      return { ...resolved, displayTitle: decoded };
    }
  }
  return { ...resolved, displayTitle: cleaned };
}

/** Operator-facing kinds that belong on the Things To Do lane. */
export const DISCOVER_THINGS_TO_DO_KINDS = new Set([
  'Things To Do',
  'Event',
  'Nightlife / Event',
  'Live Music',
  'Food & Drink',
  'New Opening',
  'Shopping Find',
]);

const DISCOVER_NIGHTLIFE_RE =
  /\b(funk night|soul night|disco night|r&b night|old school funk|dance night|day party|club night|nightlife|nightclub|\bdjs?\b|hosted by\s+dj)\b/i;
const DISCOVER_LIVE_MUSIC_RE = /\b(live music|live band|concert|open mic)\b/i;
const DISCOVER_CIRCUS_RE = /\b(circus|carnival)\b/i;
const DISCOVER_FAMILY_RE = /\b(family (?:show|event|fun)|children'?s (?:theatre|theater|show))\b/i;
const DISCOVER_RETAIL_SUBJECT_RE =
  /\b(thrift|consignment|bargain|boutique|retail|markdown|warehouse sale|sidewalk sale|pop[- ]?up shops?|pop[- ]?up markets?|shopping find|deal haul|clearance|% off)\b/i;
const DISCOVER_FOOD_SUBJECT_RE =
  /\b(restaurant|dining|brunch|tasting|dinner|cafe|coffee|bakery|food)\b/i;

/** Classification must not read web-research appendices (they mention unrelated markets/sales). */
export function discoverSubjectProse(summary: string | null | undefined): string {
  if (!summary?.trim()) return '';
  return summary.split(/\bWeb research:/i)[0]!.trim();
}

function hasRetailSubjectEvidence(title: string, description: string, metaCat: string): boolean {
  const subject = `${title}\n${description}`;
  if (DISCOVER_RETAIL_SUBJECT_RE.test(subject)) return true;
  if (/shopping|thrift|bargain|boutique|retail|markdown/.test(categoryKey(metaCat))) {
    return DISCOVER_RETAIL_SUBJECT_RE.test(subject) || /\b(sale|shop|store|market)\b/i.test(title);
  }
  return false;
}

/**
 * Displayed Discover category. Title/description and canonical event classification
 * beat stale shopping traits harvested from research dumps or raw ingest labels.
 * Does not change extractDiscoverTraits (voting/ranking).
 */
export function discoverOpportunityKind(input: DiscoverCardSource): string {
  const title = input.title ?? '';
  const description = discoverSubjectProse(input.summary);
  const meta = input.metadata ?? {};
  const listing = listingOf(meta);
  const metaCat = input.category || str(meta.opportunityCategory);
  const venue = (input.locationName ?? '').trim() || str(listing.businessName);
  const subject = `${title}\n${description}`;

  if (
    (CREATOR_RE.test(subject) || /creator_partnership|affiliate/.test(categoryKey(metaCat))) &&
    !input.eventStartsAt &&
    !DISCOVER_NIGHTLIFE_RE.test(subject) &&
    !DISCOVER_LIVE_MUSIC_RE.test(subject)
  ) {
    return 'Creator Program';
  }
  if (SPONSOR_RE.test(subject) && !CREATOR_RE.test(subject) && !input.eventStartsAt) {
    return 'Sponsor Lead';
  }
  if (FILMING_RE.test(subject) && !input.eventStartsAt) return 'Filming Lead';

  const resolved = resolveListingEventCategory({
    title,
    description,
    sourceCategory: metaCat,
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : null,
    venueName: venue || null,
    listingCategory: str(listing.category) || null,
  });

  const nightlife =
    DISCOVER_NIGHTLIFE_RE.test(subject) || resolved.category === LISTING_EVENT_CATEGORIES.nightlifeMusic;
  const liveMusic =
    DISCOVER_LIVE_MUSIC_RE.test(subject) || resolved.category === LISTING_EVENT_CATEGORIES.liveMusic;
  const circus = DISCOVER_CIRCUS_RE.test(title) || /circus/.test(categoryKey(metaCat));
  const family = DISCOVER_FAMILY_RE.test(subject);
  const eventEvidence =
    nightlife ||
    liveMusic ||
    circus ||
    family ||
    resolved.category === LISTING_EVENT_CATEGORIES.festival ||
    resolved.source === 'title' ||
    resolved.source === 'description' ||
    /music|nightlife|event|festival|circus|concert/.test(categoryKey(metaCat));

  if (nightlife) return 'Nightlife / Event';
  if (liveMusic) return 'Live Music';
  if (circus || family || resolved.category === LISTING_EVENT_CATEGORIES.festival) return 'Event';
  if (resolved.category === LISTING_EVENT_CATEGORIES.foodDrink) return 'Food & Drink';
  if (resolved.category === LISTING_EVENT_CATEGORIES.dateNight) return 'Event';

  const retail = hasRetailSubjectEvidence(title, description, metaCat);
  if (retail && !eventEvidence) return 'Shopping Find';

  if (OPENING_RE.test(title) && DISCOVER_FOOD_SUBJECT_RE.test(subject)) return 'Food & Drink';
  if (OPENING_RE.test(title) && retail) return 'Shopping Find';
  if (resolved.category === LISTING_EVENT_CATEGORIES.cooking) return 'Things To Do';
  if (DISCOVER_FOOD_SUBJECT_RE.test(subject) && /food_drink|dining|restaurant/.test(categoryKey(metaCat))) {
    return 'Food & Drink';
  }

  if (input.eventStartsAt || resolved.category === LISTING_EVENT_CATEGORIES.event) return 'Things To Do';
  if (retail) return 'Shopping Find';
  return 'Watch / Research';
}

export function discoverLaneIsCompatible(kind: string, action: DiscoverPrimaryAction): boolean {
  if (action.key === 'post_now') return DISCOVER_THINGS_TO_DO_KINDS.has(kind) || kind === 'Filming Lead';
  if (action.key === 'pitch') return kind === 'Sponsor Lead' || kind === 'Creator Program';
  return action.key === 'save' || action.key === 'skip';
}

function formatWhen(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function discoverWhereWhen(input: DiscoverCardSource): string | null {
  const when = formatWhen(input.eventStartsAt);
  const where = (input.locationName ?? '').trim() || (isKcMetroLocation(input.title) ? 'Kansas City' : '');
  if (where && when) return `${where} · ${when}`;
  if (where) return where;
  if (when) return when;
  return null;
}

export function discoverConfidenceLabel(input: DiscoverCardSource): string {
  return discoverTrustLabel(input);
}

export function discoverPrimaryAction(
  kind: string,
  input: DiscoverCardSource = { title: '' },
  now = new Date(),
): DiscoverPrimaryAction {
  return discoverPrimaryActionForState(kind, input, now);
}

export function discoverWhyItMatters(input: DiscoverCardSource, kind: string): string {
  const whereWhen = discoverWhereWhen(input);
  const trust = evaluateDiscoverTrust(
    { ...input, title: discoverDisplayTitle(input) },
    kind,
    whereWhen,
  );
  if (trust.whyItMatters) return trust.whyItMatters;
  if (whereWhen) return `${discoverDisplayTitle(input)} — ${kind} · ${whereWhen}.`;
  return `${discoverDisplayTitle(input)} — ${kind}.`;
}

export function scoreDiscoverCandidate(
  input: DiscoverCardSource,
  weights: DiscoverTasteWeights,
  now = new Date(),
): number {
  const traits = extractDiscoverTraits(input);
  const kind = discoverOpportunityKind(input);
  const preference = discoverPreferenceFit(traits, weights) * 14;
  const discovered = input.discoveredAt
    ? input.discoveredAt instanceof Date
      ? input.discoveredAt
      : new Date(input.discoveredAt)
    : null;
  const ageHours =
    discovered && !Number.isNaN(discovered.getTime())
      ? (now.getTime() - discovered.getTime()) / 36e5
      : 999;
  const freshness = ageHours < 48 ? 12 : ageHours < 168 ? 8 : ageHours < 336 ? 4 : 0;
  const actionable =
    (input.eventStartsAt ? 8 : 0) + ((input.locationName ?? '').trim() ? 4 : 0) + (input.sourceUrl ? 2 : 0);
  const confidence =
    discoverConfidenceLabel(input) === 'Listing looks current'
      ? 10
      : discoverConfidenceLabel(input) === 'Needs verification'
        ? 3
        : 0;
  const model = Math.min(8, Number((input.metadata?.bensonScore as { composite?: number } | undefined)?.composite ?? 0) / 12.5);
  const kindBonus = kind === 'Watch / Research' ? -4 : 0;
  return preference + freshness + actionable + confidence + model + kindBonus;
}

export function buildDiscoverCardModel(
  input: DiscoverCardSource,
  weights: DiscoverTasteWeights,
  now = new Date(),
): DiscoverCardModel {
  const traits = extractDiscoverTraits(input);
  const opportunityKind = discoverOpportunityKind(input);
  const display = resolveOpportunityDisplay(input);
  const titled = { ...input, title: display.displayTitle };
  const whereWhen = discoverWhereWhen(titled);
  const trust = evaluateDiscoverTrust(titled, opportunityKind, whereWhen, now);
  return {
    title: display.displayTitle,
    subtitle: display.displaySubtitle,
    whyItMatters: trust.whyItMatters ?? discoverWhyItMatters(titled, opportunityKind),
    opportunityKind,
    whereWhen,
    confidenceLabel: trust.trustLabel,
    primaryAction: discoverPrimaryAction(opportunityKind, titled, now),
    traits,
    rankScore: scoreDiscoverCandidate(titled, weights, now),
  };
}
