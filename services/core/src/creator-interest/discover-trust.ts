/**
 * Discover-only trust, freshness, and honest recommendation state.
 * Does not change Home, Calendar, or public-event eligibility.
 */
import { evaluatePitchReadiness } from '../creator-agent/pitch-readiness.js';
import type { ContactVerificationStatus } from '../creator-agent/types.js';
import { isDiscoverHubUrl } from './discover-identity.js';

export type DiscoverRecommendationState = 'post_now' | 'pitch' | 'save' | 'skip';

export type DiscoverTrustSource = {
  title: string;
  summary?: string | null;
  locationName?: string | null;
  sourceUrl?: string | null;
  eventStartsAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
};

export type DiscoverTrustResult = {
  visible: boolean;
  hideReason: string | null;
  trustLabel: string;
  verificationGap: string | null;
  whyItMatters: string | null;
};

const THINGS_TO_DO = new Set([
  'Things To Do',
  'Event',
  'Nightlife / Event',
  'Live Music',
  'Food & Drink',
  'New Opening',
  'Shopping Find',
]);

const RAW_MARKDOWN_RE = /(^\s*[#*_]|^\s*\[|\*\*|\]\([^)]*\)|^\s*>\s|utm_source=openai)/m;
const TIMESTAMP_DUMP_RE = /\b20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\b/;
const GENERIC_WHY_RE =
  /possible .+ for kellie|strong social media potential|kc has countless things|discover the ultimate|the ultimate (?:guide|children museum)|things to do in [^.]{0,80}\.?$/i;
const TRADE_CONFERENCE_RE =
  /\b(annual conference|user conference|developers? conference|jnuc|mobile health clinics|exposition|interventional pain|inland rivers|ports?\s*&\s*terminals|arema|physician|healthcare professionals?)\b/i;
const HUB_CHILD_TITLE_RE =
  /^(birthday party(?: package)?|field trip|hy-vee(?: daily deals.*)?|kkfi|kansas city royals)$/i;
const FIELD_DUMP_TITLE_RE =
  /^(operational hours|.+ operating hours|.+ duration|official website of .+)$/i;
const FRAGMENTARY_HEADING_RE =
  /^(caption\s*:.*|participating\s+vendors?(?::.*)?|featured\s+vendors?|vendor\s+list|members-only(?: events(?: and promotions)?)?|visit the .+|stop scrolling.*|this week(?:'s)?(?: events)?|(?:special|community|featured|upcoming|our)\s+(?:events?|experiences?)|\w+\s+activations?|event(?:s)? calendar|hours(?: of operation)?|address and hours)$/i;
const WEEKDAY_RE = '(?:mon|tues|wednes|thurs|fri|satur|sun|week)days?';
const RECURRING_SERVICE_RE = new RegExp(
  `^(?:${WEEKDAY_RE})(?:\\s+and\\s+${WEEKDAY_RE})?\\s+(?:lunch|dinner|brunch|happy hour|hours)$`,
  'i',
);
const VENUE_SERVICE_RE =
  /^(grad(?:uation)? party|catering(?: and .+)?|small events|private (?:events|parties)|book (?:us|a party))$/i;
const PLACE_CORE_RE = /\b(city hall|city park|park place|town square|civic center)\b/i;
const PLACE_NOISE_RE =
  /\b(leawood|overland park|kansas city|olathe|lenexa|independence|belton|shawnee|liberty|prairie village|missouri|kansas|mo|ks|the)\b/gi;
const LOYALTY_LISTING_RE =
  /\b(style points|rewards club|loyalty club|savers club|club cm)\b|^earn\b.+\bpoints$/i;
const LOYALTY_URL_RE = /\/(club-cm|rewards|loyalty|savers-club)(?:\/|$|\?)/i;
const VENUE_KIND_RE =
  /\b(thrift store|museum(?: of art)?|art gallery|theat(?:er|re)|stadium|arena|hotel|restaurant|caf[eé]|thrift)\b|\bclub$/i;
const VENUE_OPPORTUNITY_RE =
  /\b(sale|concert|festival|gala|fair|show|race|party|workshop|class|market|dash|tour|opening|drop|restock|savings|perks|juice|tee|paint|event|lunch|dinner|brunch|exhibit|exhibition|performance|game|match)\b/i;
const SEO_TITLE_RE =
  /official (?:web)?site(?: of| for)?\b|.+\bat\s+[a-z][\w .'-]+ blog$|\bresults at\b.+\bblog\b|\boffers? (?:&|and) deals?\b/i;
const AMENITY_ONLY_RE =
  /^(donation center(?:\s*[—–-].*)?|coffee and espresso bar|worlds of fun(?:\s*[&+]\s*oceans of fun)?)$/i;
const PROMO_SKU_RE = /\bwith purchase of\b|^free .+ with purchase/i;
const SHOPPING_SALE_RE = /\b(sale|restock|markdown|% off|warehouse|opening|drop)\b/i;
const OFFICIAL_SITE_WHY_RE = /^official site for\b/i;
const CAPACITY_DUMP_RE = /\|\s*capacity\b/i;
const SEO_URL_RE = /storage\.googleapis\.com\/[a-z0-9]{10,}\/|\/property\/|commercialrealty|address-and-hours/i;
const FOREIGN_ONLY_RE = /\b(de meest|rondreizende|verenigde staten|bezoek)\b/i;
const TITLE_SUMMARY_CLASH_RE = /^##\s*\[([^\]]+)\]/;
const SEASONAL_MONTH: Array<{ re: RegExp; month: number }> = [
  { re: /\bjuneteenth\b/i, month: 6 },
  { re: /\bst\.?\s*patrick/i, month: 3 },
];

export const DISCOVER_POST_NOW_MS = 16 * 24 * 60 * 60 * 1000;

export function looksLikeRawScraperText(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  if (RAW_MARKDOWN_RE.test(value)) return true;
  if (TIMESTAMP_DUMP_RE.test(value)) return true;
  return false;
}

export function isTradeConference(title: string, summary?: string | null): boolean {
  return TRADE_CONFERENCE_RE.test(`${title}\n${summary ?? ''}`);
}

export function isFieldDumpTitle(title: string): boolean {
  return FIELD_DUMP_TITLE_RE.test(title.trim());
}

export function isFragmentaryDiscoverTitle(title: string): boolean {
  const value = title.trim();
  if (!value) return true;
  if (FRAGMENTARY_HEADING_RE.test(value)) return true;
  if (RECURRING_SERVICE_RE.test(value)) return true;
  if (VENUE_SERVICE_RE.test(value)) return true;
  if (CAPACITY_DUMP_RE.test(value)) return true;
  if (AMENITY_ONLY_RE.test(value)) return true;
  if (PROMO_SKU_RE.test(value)) return true;
  return false;
}

export function isPlaceOnlyDiscoverTitle(title: string): boolean {
  const value = title.trim();
  if (!PLACE_CORE_RE.test(value)) return false;
  const leftover = value
    .replace(PLACE_CORE_RE, ' ')
    .replace(PLACE_NOISE_RE, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
  return leftover.length === 0;
}

export function isLoyaltyListingWithoutEvent(
  title: string,
  eventStartsAt?: Date | string | null,
  sourceUrl?: string | null,
): boolean {
  if (eventDate(eventStartsAt)) return false;
  if (LOYALTY_LISTING_RE.test(title.trim())) return true;
  return LOYALTY_URL_RE.test(sourceUrl ?? '');
}

export function isUndatedVenueOnlyListing(
  title: string,
  eventStartsAt?: Date | string | null,
): boolean {
  if (eventDate(eventStartsAt)) return false;
  const value = title.trim();
  if (!value || VENUE_OPPORTUNITY_RE.test(value)) return false;
  return VENUE_KIND_RE.test(value);
}

export function isSeoLeftoverDiscover(
  title: string,
  sourceUrl?: string | null,
  summary?: string | null,
): boolean {
  if (SEO_TITLE_RE.test(title) || SEO_TITLE_RE.test(summary ?? '')) return true;
  if (OFFICIAL_SITE_WHY_RE.test((summary ?? '').trim())) return true;
  if (SEO_URL_RE.test(sourceUrl ?? '')) return true;
  return false;
}

export function hasPostNowSourceEvidence(input: DiscoverTrustSource): boolean {
  const url = (input.sourceUrl ?? '').trim();
  if (!url) return false;
  if (isDiscoverHubUrl(url) && OFFICIAL_SITE_WHY_RE.test((input.summary ?? '').trim())) return false;
  if (isPlaceOnlyDiscoverTitle(input.title)) return false;
  if (isFragmentaryDiscoverTitle(input.title)) return false;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return false;
  } catch {
    return false;
  }
  return true;
}

export function isPastSeasonalOpportunity(
  title: string,
  eventStartsAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (eventDate(eventStartsAt)) return false;
  const month = now.getUTCMonth() + 1;
  return SEASONAL_MONTH.some((entry) => entry.re.test(title) && month > entry.month);
}

function listingOf(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const listing = meta?.listingScrape;
  return listing && typeof listing === 'object' && !Array.isArray(listing)
    ? (listing as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function eventDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function subjectProse(summary: string | null | undefined): string {
  if (!summary?.trim()) return '';
  return summary.split(/\bWeb research:/i)[0]!.trim();
}

export function isImplausibleDiscoverDate(
  eventStartsAt: Date | string | null | undefined,
  now = new Date(),
  prose?: string | null,
): boolean {
  const date = eventDate(eventStartsAt);
  if (!date) return false;
  if (date.getUTCFullYear() > now.getUTCFullYear() + 1) return true;
  const copy = prose ?? '';
  if (date.getUTCFullYear() > now.getUTCFullYear() && /\bthis (month|week)\b/i.test(copy)) return true;
  const monthYear = copy.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/i,
  );
  if (monthYear?.[2] && Number(monthYear[2]) < date.getUTCFullYear()) return true;
  return false;
}

function contactStatusFromMetadata(meta: Record<string, unknown> | null | undefined): ContactVerificationStatus {
  const listing = listingOf(meta);
  const email = str(listing.email) || str(meta?.contactEmail);
  const phone = str(listing.phone) || str(meta?.contactPhone);
  const website = str(listing.website) || str(meta?.website);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/info@|hello@|support@/i.test(email)) {
    return 'found_unverified';
  }
  if (phone || website) return 'contact_form';
  return 'missing';
}

export function discoverPitchReadiness(input: DiscoverTrustSource): {
  pitchReady: boolean;
  label: 'Pitch' | 'Contact needed';
} {
  const listing = listingOf(input.metadata);
  const business = str(listing.businessName) || input.title;
  const status = evaluatePitchReadiness({
    businessName: business,
    contactVerificationStatus: contactStatusFromMetadata(input.metadata),
    hasPersonalizedDraft: false,
    hasConcreteAngle: false,
    hasDeliverableValueProp: false,
    hasTimingReason: Boolean(input.eventStartsAt),
    sendMechanismAvailable: false,
    suppressed: false,
    stale: false,
    duplicateUnresolvedOutreach: false,
  });
  if (status === 'pitch_ready') return { pitchReady: true, label: 'Pitch' };
  return { pitchReady: false, label: 'Contact needed' };
}

export function discoverRecommendationState(
  kind: string,
  input: DiscoverTrustSource,
  now = new Date(),
): DiscoverRecommendationState {
  if (kind === 'Sponsor Lead' || kind === 'Creator Program') return 'pitch';
  const start = eventDate(input.eventStartsAt);
  const timely = Boolean(
    start &&
      start.getTime() - now.getTime() >= -12 * 60 * 60 * 1000 &&
      start.getTime() - now.getTime() <= DISCOVER_POST_NOW_MS,
  );
  if ((THINGS_TO_DO.has(kind) || kind === 'Filming Lead') && timely && hasPostNowSourceEvidence(input)) {
    if (kind === 'Shopping Find' && !SHOPPING_SALE_RE.test(`${input.title}\n${input.summary ?? ''}`)) {
      return 'save';
    }
    return 'post_now';
  }
  return 'save';
}

export function discoverPrimaryActionForState(
  kind: string,
  input: DiscoverTrustSource,
  now = new Date(),
): { key: DiscoverRecommendationState; label: string } {
  const state = discoverRecommendationState(kind, input, now);
  if (state === 'post_now') return { key: 'post_now', label: 'Post now' };
  if (state === 'pitch') {
    return { key: 'pitch', label: discoverPitchReadiness(input).label };
  }
  return { key: 'save', label: 'Save' };
}

export function discoverTrustLabel(input: DiscoverTrustSource): string {
  const hasWhen = Boolean(input.eventStartsAt);
  const hasWhere = Boolean((input.locationName ?? '').trim());
  const hasSource = Boolean((input.sourceUrl ?? '').trim()) && !isDiscoverHubUrl(input.sourceUrl);
  if (hasWhen && hasWhere && hasSource) return 'Listing looks current';
  if (!hasSource) return 'Source is thin';
  return 'Needs verification';
}

function firstCleanSentence(summary: string | null | undefined): string | null {
  const subject = subjectProse(summary);
  if (!subject) return null;
  const stripped = subject
    .replace(TIMESTAMP_DUMP_RE, ' ')
    .replace(/[#*_`]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length < 12) return null;
  if (looksLikeRawScraperText(stripped)) return null;
  if (GENERIC_WHY_RE.test(stripped)) return null;
  const first = stripped.split(/(?<=[.!?])\s+/)[0] ?? stripped;
  if (GENERIC_WHY_RE.test(first)) return null;
  return first.length > 180 ? `${first.slice(0, 177).trim()}…` : first;
}

export function discoverSpecificWhy(
  input: DiscoverTrustSource,
  kind: string,
  whereWhen: string | null,
): { why: string | null; verificationGap: string | null } {
  const clean = firstCleanSentence(input.summary);
  const title = (input.title ?? '').trim();
  const gap =
    kind === 'Sponsor Lead' || kind === 'Creator Program'
      ? discoverPitchReadiness(input).pitchReady
        ? null
        : 'Benson does not have a verified contact yet.'
      : !(input.sourceUrl ?? '').trim()
        ? 'Benson only has a listing title so far.'
        : null;

  if (clean) {
    return { why: gap ? `${clean} ${gap}` : clean, verificationGap: gap };
  }
  if (whereWhen && title) {
    const short = title.length > 72 ? `${title.slice(0, 69).trim()}…` : title;
    return {
      why: gap ? `${short} — ${kind} · ${whereWhen}. ${gap}` : `${short} — ${kind} · ${whereWhen}.`,
      verificationGap: gap,
    };
  }
  return { why: null, verificationGap: gap };
}

export function evaluateDiscoverTrust(
  input: DiscoverTrustSource,
  kind: string,
  whereWhen: string | null,
  now = new Date(),
): DiscoverTrustResult {
  const title = (input.title ?? '').trim();
  if (looksLikeRawScraperText(title)) {
    return {
      visible: false,
      hideReason: 'raw_scraper_text',
      trustLabel: 'Source is thin',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (isTradeConference(title, input.summary)) {
    return {
      visible: false,
      hideReason: 'unsupported_lane',
      trustLabel: 'Needs verification',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (
    isFieldDumpTitle(title) ||
    isFragmentaryDiscoverTitle(title) ||
    isPlaceOnlyDiscoverTitle(title) ||
    isUndatedVenueOnlyListing(title, input.eventStartsAt)
  ) {
    return {
      visible: false,
      hideReason:
        isPlaceOnlyDiscoverTitle(title) || isUndatedVenueOnlyListing(title, input.eventStartsAt)
          ? 'place_only'
          : 'raw_scraper_text',
      trustLabel: 'Source is thin',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (isLoyaltyListingWithoutEvent(title, input.eventStartsAt, input.sourceUrl)) {
    return {
      visible: false,
      hideReason: 'unsupported_lane',
      trustLabel: 'Needs verification',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (isSeoLeftoverDiscover(title, input.sourceUrl, input.summary)) {
    return {
      visible: false,
      hideReason: 'seo_leftover',
      trustLabel: 'Source is thin',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (isPastSeasonalOpportunity(title, input.eventStartsAt, now)) {
    return {
      visible: false,
      hideReason: 'stale_or_implausible_date',
      trustLabel: 'Needs verification',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (isDiscoverHubUrl(input.sourceUrl) && !eventDate(input.eventStartsAt)) {
    return {
      visible: false,
      hideReason: 'hub_listing_without_entity',
      trustLabel: 'Source is thin',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (isImplausibleDiscoverDate(input.eventStartsAt, now, `${title}\n${input.summary ?? ''}`)) {
    return {
      visible: false,
      hideReason: 'stale_or_implausible_date',
      trustLabel: 'Needs verification',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (FOREIGN_ONLY_RE.test(`${title}\n${input.summary ?? ''}`)) {
    return {
      visible: false,
      hideReason: 'raw_scraper_text',
      trustLabel: 'Source is thin',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  if (HUB_CHILD_TITLE_RE.test(title) && isDiscoverHubUrl(input.sourceUrl)) {
    return {
      visible: false,
      hideReason: 'hub_listing_without_entity',
      trustLabel: 'Source is thin',
      verificationGap: null,
      whyItMatters: null,
    };
  }
  const summaryClash = (input.summary ?? '').match(TITLE_SUMMARY_CLASH_RE);
  if (summaryClash?.[1]) {
    const named = summaryClash[1].toLowerCase();
    if (named.length >= 4 && !title.toLowerCase().includes(named.split(',')[0]!.slice(0, 12))) {
      return {
        visible: false,
        hideReason: 'title_summary_mismatch',
        trustLabel: 'Needs verification',
        verificationGap: null,
        whyItMatters: null,
      };
    }
  }
  const { why, verificationGap } = discoverSpecificWhy(input, kind, whereWhen);
  if (!why) {
    return {
      visible: false,
      hideReason: 'weak_explanation',
      trustLabel: 'Source is thin',
      verificationGap,
      whyItMatters: null,
    };
  }
  if (kind === 'Watch / Research' && !input.eventStartsAt && isDiscoverHubUrl(input.sourceUrl)) {
    return {
      visible: false,
      hideReason: 'weak_explanation',
      trustLabel: 'Source is thin',
      verificationGap,
      whyItMatters: null,
    };
  }
  return {
    visible: true,
    hideReason: null,
    trustLabel: discoverTrustLabel(input),
    verificationGap,
    whyItMatters: why,
  };
}
