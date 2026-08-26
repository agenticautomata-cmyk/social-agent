/**
 * Discover-only eligibility. Hard factual gates before preference ranking.
 * Home / Today continue to use home-eligibility.ts — do not import this there.
 */
import { isEmploymentOpportunity } from '../creator-agent/employment-intent.js';
import { isOpaqueContentId, isInstagramPostUrl, isLinkHubUrl } from '../ask-benson/url-type.js';
import { isKcMetroLocation, isOutOfMarketLocation } from '../ask-benson/url-geo.js';

export type DiscoverEligibilityReason =
  | 'eligible'
  | 'opaque_content_id'
  | 'malformed_entity'
  | 'employment_jobs_careers'
  | 'out_of_market'
  | 'missing_local_geo'
  | 'unsupported_food_classification'
  | 'link_hub_without_opportunity'
  | 'social_post_without_entity'
  | 'article_without_opportunity'
  | 'known_bad_extraction'
  | 'no_provenance'
  | 'quarantined'
  | 'unsupported_lane';

export type DiscoverEligibilityInput = {
  title: string;
  summary?: string | null;
  hook?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  sourceUrl?: string | null;
  category?: string | null;
  contentCategory?: string | null;
  metadata?: Record<string, unknown> | null;
  eventStartsAt?: Date | string | null;
  eventEndsAt?: Date | string | null;
  creatorValueStatus?: string | null;
  lifecycleStatus?: string | null;
};

export type DiscoverEligibilityResult = {
  eligible: boolean;
  reasons: DiscoverEligibilityReason[];
};

const DISCOVER_OUT_OF_MARKET_RE =
  /\b(bronx|brooklyn|queens|manhattan|harlem|staten island|\bnyc\b|new york city|\bnew york\b|tulsa|oklahoma city|st\.?\s*louis|chicago|dallas|houston|denver|omaha|des moines|wichita|springfield mo|branson|memphis|nashville|atlanta|miami|los angeles|\bla\b|san francisco|seattle|portland or|phoenix|las vegas|tokyo|osaka|\bjapan\b)\b/i;

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff]/;

const SOCIAL_HUB_CHROME_RE =
  /official:\s*(tiktok|instagram|facebook)|tiktok,\s*instagram,\s*facebook|at instagram\b/i;

const FOOD_CATEGORY_RE = /restaurant|food_drink|food.?discovery|dining|\bcafe\b|\bmenu\b/;

const FOOD_EVIDENCE_RE =
  /\b(restaurant|menu|dining|brunch|coffee|caf[eé]|bakery|bistro|happy hour|tasting|chef|kitchen|pizza|tacos?|bbq|brewery|winery)\b/i;

const EVENT_LIKE_RE =
  /\b(events?|tickets?|concert|festival|reading|meetup|dj\b|nightlife|class(?:es)?|workshop)\b/i;

const NATIONAL_CREATOR_LANE_RE =
  /\b(affiliate(?:\s+program)?|creator\s+program|influencer\s+program|brand\s+ambassador|ugc\s+program|creator_partnership|creator partnership|national\s+sponsor|online\s+creator)\b/i;

const ARTICLE_LANE_RE = /industry_insight|editorial_roundup|\bnews\b|article/;

const OSC_LA_WORKERS_RE = /los angeles welcomes workers/i;

const AT_SOCIAL_RE = /^([A-Za-z0-9._-]{4,40})\s+at\s+(instagram|tiktok|facebook)\b/i;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function listingOf(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const listing = meta?.listingScrape;
  return listing && typeof listing === 'object' && !Array.isArray(listing)
    ? (listing as Record<string, unknown>)
    : {};
}

function haystack(input: DiscoverEligibilityInput): string {
  const meta = input.metadata ?? {};
  const listing = listingOf(meta);
  return [
    input.title,
    input.summary,
    input.hook,
    input.locationName,
    input.formattedAddress,
    input.category,
    input.contentCategory,
    str(meta.entityOpportunityType),
    str(meta.opportunityCategory),
    str(listing.businessName),
    str(listing.documentTitle),
    str(listing.location),
  ]
    .filter(Boolean)
    .join('\n');
}

function categoryKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim().replace(/[\s/-]+/g, '_');
}

function entityTypeOf(input: DiscoverEligibilityInput): string {
  const meta = input.metadata ?? {};
  return categoryKey(str(meta.entityOpportunityType) || input.category || input.contentCategory);
}

function businessNameOf(input: DiscoverEligibilityInput): string {
  return str(listingOf(input.metadata).businessName).trim();
}

export function opaqueSubjectFromTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const atSocial = trimmed.match(AT_SOCIAL_RE);
  if (atSocial?.[1] && isOpaqueContentId(atSocial[1])) return atSocial[1];
  const first = trimmed.split(/[\s|/—–-]+/)[0] ?? '';
  if (isOpaqueContentId(first) && /instagram|tiktok|facebook/i.test(trimmed)) return first;
  if (isOpaqueContentId(trimmed)) return trimmed;
  return null;
}

function isEventLike(input: DiscoverEligibilityInput): boolean {
  if (input.eventStartsAt) return true;
  return EVENT_LIKE_RE.test(`${input.title} ${input.summary ?? ''}`);
}

function isNationalCreatorLane(input: DiscoverEligibilityInput): boolean {
  if (isEventLike(input)) return false;
  const blob = `${input.title} ${input.category ?? ''} ${entityTypeOf(input)} ${str(input.metadata?.opportunityCategory)}`;
  return NATIONAL_CREATOR_LANE_RE.test(blob);
}

function isFoodCategory(input: DiscoverEligibilityInput): boolean {
  return FOOD_CATEGORY_RE.test(entityTypeOf(input)) || FOOD_CATEGORY_RE.test(categoryKey(input.category));
}

function hasFoodEvidence(input: DiscoverEligibilityInput): boolean {
  return FOOD_EVIDENCE_RE.test(`${input.title} ${input.summary ?? ''} ${businessNameOf(input)}`);
}

function discoverOutOfMarket(text: string): boolean {
  if (isKcMetroLocation(text)) return false;
  if (isOutOfMarketLocation(text)) return true;
  return DISCOVER_OUT_OF_MARKET_RE.test(text);
}

function hasUsableProvenance(input: DiscoverEligibilityInput): boolean {
  const url = (input.sourceUrl ?? '').trim();
  if (/^https?:\/\//i.test(url)) return true;
  const ingest = str(input.metadata?.ingest);
  return ingest.length > 0;
}

function hasActionableSubject(input: DiscoverEligibilityInput): boolean {
  if (input.eventStartsAt) return true;
  if (businessNameOf(input) && !isOpaqueContentId(businessNameOf(input))) return true;
  const cat = entityTypeOf(input);
  if (
    /local_business|opening|dining|shopping|thrift|boutique|nightlife|festival|event|place_discovery|attraction/.test(
      cat,
    )
  ) {
    return (input.title ?? '').trim().length >= 6;
  }
  if (isNationalCreatorLane(input)) return (input.title ?? '').trim().length >= 6;
  return false;
}

export function evaluateDiscoverEligibility(input: DiscoverEligibilityInput): DiscoverEligibilityResult {
  const reasons: DiscoverEligibilityReason[] = [];
  const title = (input.title ?? '').trim();
  const meta = input.metadata ?? {};
  const text = haystack(input);
  const status = input.creatorValueStatus ?? null;
  const lifecycle = input.lifecycleStatus ?? null;

  if (status === 'rejected' || status === 'archived' || status === 'hidden_raw_signal') {
    reasons.push('quarantined');
  }
  if (lifecycle === 'archived' || lifecycle === 'expired') {
    reasons.push('quarantined');
  }
  if (str(meta.programLibraryQuiet) === 'true' || meta.programLibraryQuiet === true) {
    reasons.push('quarantined');
  }

  const opaque = opaqueSubjectFromTitle(title);
  if (opaque) reasons.push('opaque_content_id');
  const biz = businessNameOf(input);
  if (biz && isOpaqueContentId(biz)) reasons.push('opaque_content_id');

  if (title.length < 4 || /^(tbd|unknown|n\/a|null|undefined|test)$/i.test(title)) {
    reasons.push('malformed_entity');
  }

  if (OSC_LA_WORKERS_RE.test(title) || OSC_LA_WORKERS_RE.test(text)) {
    reasons.push('known_bad_extraction');
  }

  if (
    isEmploymentOpportunity({
      title,
      category: input.category ?? input.contentCategory,
      sourceUrl: input.sourceUrl,
      summary: input.summary,
      metadata: input.metadata,
    })
  ) {
    reasons.push('employment_jobs_careers');
  }

  const sourceUrl = (input.sourceUrl ?? '').trim();
  if (isInstagramPostUrl(sourceUrl)) {
    const shortcode = sourceUrl.match(/\/(p|reel|reels|tv)\/([^/]+)/i)?.[2] ?? '';
    const subjectIsPost =
      Boolean(opaque) ||
      isOpaqueContentId(title) ||
      (shortcode && title.toLowerCase().includes(shortcode.toLowerCase())) ||
      !biz ||
      isOpaqueContentId(biz);
    if (subjectIsPost) reasons.push('social_post_without_entity');
  }

  if (isLinkHubUrl(sourceUrl) || SOCIAL_HUB_CHROME_RE.test(title)) {
    const concrete =
      Boolean(input.eventStartsAt) || hasFoodEvidence(input) || /opening|boutique|thrift|concert/i.test(text);
    if (!concrete) reasons.push('link_hub_without_opportunity');
  }

  if (isFoodCategory(input) && !hasFoodEvidence(input)) {
    reasons.push('unsupported_food_classification');
  }

  if (!hasActionableSubject(input)) {
    reasons.push('article_without_opportunity');
  } else if (ARTICLE_LANE_RE.test(categoryKey(input.category)) || ARTICLE_LANE_RE.test(categoryKey(input.contentCategory))) {
    if (!input.eventStartsAt && !businessNameOf(input)) reasons.push('article_without_opportunity');
  }

  if (!hasUsableProvenance(input)) reasons.push('no_provenance');

  if (!isNationalCreatorLane(input)) {
    if (discoverOutOfMarket(text)) {
      reasons.push('out_of_market');
    } else if (CJK_RE.test(text) && !isKcMetroLocation(text)) {
      reasons.push('out_of_market');
    } else if ((isEventLike(input) || isFoodCategory(input)) && !isKcMetroLocation(text)) {
      reasons.push('missing_local_geo');
    }
  }

  const unique = [...new Set(reasons)];
  return { eligible: unique.length === 0, reasons: unique.length === 0 ? ['eligible'] : unique };
}

export function isDiscoverEligible(input: DiscoverEligibilityInput): boolean {
  return evaluateDiscoverEligibility(input).eligible;
}
