import { extractUrls } from '../ask-benson/collect-from-link.js';
import { isEditorialRoundupUrl } from '../ask-benson/editorial-roundup.js';
import { classifyStandaloneUrlType } from '../ask-benson/url-type.js';
import {
  parsePartnershipUrl,
  type PartnershipUrlIntelligence,
} from './url-intelligence.js';

export const INTAKE_ROUTES = [
  'creator_partnership',
  'event_opportunity',
  'local_discovery',
  'product_brand_opportunity',
  'social_post',
  'social_profile',
  'link_hub',
  'unsupported',
] as const;

export type IntakeRoute = (typeof INTAKE_ROUTES)[number];

const STRONG_CREATOR_BUSINESS_RE =
  /\b(creator\s+program|influencer\s+program|ambassador\s+program|affiliate\s+program|sponsorship\s+program|collaboration\s+program|collab\s+program|ugc\s+program|gifting\s+program|creator\s+application|apply\s+as\s+a\s+creator|brand\s+ambassador|paid\s+sponsorship|gifted\s+product|shopmy|ltk|rewardstyle|brand\s+collab|creator\s+partnership)\b/i;

const EVENT_HOST_RE =
  /eventbrite|ticketmaster|seatgeek|axs\.com|universe\.com|tickets\.com/i;

const EVENT_PATH_RE = /\/(events?|calendar|ticket|concert|show|tickets)\b/i;

const LOCAL_BUSINESS_PATH_RE =
  /\/(menus?|order|reservations?|dine|dining|locations?|find-us|about-us)\b/i;

const PRODUCT_PATH_RE =
  /\/(product|shop|store|collection|c\/|p\/|handbag|jewelry|beauty|brand)\b/i;

const CATEGORY_PATH_RE = /\/(c\/|category|collections?)\//i;

const PROGRAM_PATH_RE = /\/(creator|ambassador|affiliate|influencer|program)\b/i;

export function hasStrongCreatorBusinessSignal(message: string | null | undefined): boolean {
  return STRONG_CREATOR_BUSINESS_RE.test((message ?? '').trim());
}

export type UrlIntakeRouteResult = {
  route: IntakeRoute;
  confidence: number;
  alternatives: Array<{ route: IntakeRoute; confidence: number; reason: string }>;
  ambiguous: boolean;
  urlIntel: PartnershipUrlIntelligence | null;
  signals: Array<{ name: string; weight: number; direction: IntakeRoute }>;
};

function scoreRoute(
  intel: PartnershipUrlIntelligence,
  message: string,
): { scores: Record<IntakeRoute, number>; signals: UrlIntakeRouteResult['signals'] } {
  const scores: Record<IntakeRoute, number> = {
    creator_partnership: 0,
    event_opportunity: 0,
    local_discovery: 0,
    product_brand_opportunity: 0,
    social_post: 0,
    social_profile: 0,
    link_hub: 0,
    unsupported: 0,
  };
  const signals: UrlIntakeRouteResult['signals'] = [];

  const host = intel.hostname.toLowerCase();
  const path = intel.originalUrl.toLowerCase();
  const urlType = classifyStandaloneUrlType(intel.originalUrl);

  if (urlType === 'social_post') {
    scores.social_post += 0.99;
    signals.push({ name: 'social_post_url', weight: 0.99, direction: 'social_post' });
    return { scores, signals };
  }
  if (urlType === 'social_profile') {
    scores.social_profile += 0.99;
    signals.push({ name: 'social_profile_url', weight: 0.99, direction: 'social_profile' });
    return { scores, signals };
  }
  if (urlType === 'link_hub') {
    scores.link_hub += 0.99;
    signals.push({ name: 'link_hub_url', weight: 0.99, direction: 'link_hub' });
    return { scores, signals };
  }

  if (EVENT_HOST_RE.test(host) || EVENT_PATH_RE.test(path)) {
    scores.event_opportunity += 0.92;
    signals.push({ name: 'event_host_or_path', weight: 0.92, direction: 'event_opportunity' });
  }

  if (isEditorialRoundupUrl(intel.originalUrl)) {
    scores.event_opportunity += 0.94;
    signals.push({
      name: 'editorial_roundup_path',
      weight: 0.94,
      direction: 'event_opportunity',
    });
  }

  if (LOCAL_BUSINESS_PATH_RE.test(path)) {
    scores.local_discovery += 0.7;
    signals.push({ name: 'local_business_path', weight: 0.7, direction: 'local_discovery' });
  }

  if (PRODUCT_PATH_RE.test(path) || CATEGORY_PATH_RE.test(path)) {
    scores.product_brand_opportunity += 0.55;
    signals.push({ name: 'commerce_path', weight: 0.55, direction: 'product_brand_opportunity' });
  }

  if (intel.storeFilterTokens.length > 0) {
    scores.product_brand_opportunity += 0.2;
    signals.push({
      name: 'store_filter_param',
      weight: 0.2,
      direction: 'product_brand_opportunity',
    });
  }

  if (PROGRAM_PATH_RE.test(path)) {
    scores.creator_partnership += 0.65;
    signals.push({ name: 'program_url_path', weight: 0.65, direction: 'creator_partnership' });
  }

  if (hasStrongCreatorBusinessSignal(message)) {
    scores.creator_partnership += 0.9;
    signals.push({
      name: 'creator_business_language',
      weight: 0.9,
      direction: 'creator_partnership',
    });
  }

  if (
    /\b(event|concert|festival|ticket|opening)\b/i.test(message) &&
    !hasStrongCreatorBusinessSignal(message)
  ) {
    scores.event_opportunity += 0.35;
    signals.push({
      name: 'event_message_keywords',
      weight: 0.35,
      direction: 'event_opportunity',
    });
  }

  if (/\b(restaurant|dining|brunch|menu|food|cafe|coffee)\b/i.test(message)) {
    scores.local_discovery += 0.45;
    signals.push({ name: 'food_local_message', weight: 0.45, direction: 'local_discovery' });
  }

  return { scores, signals };
}

/**
 * Classify a pasted URL into an Ask Benson intake route.
 * Commerce URL alone does NOT equal creator_partnership.
 * Ambiguous cases without strong creator-business signals default to local_discovery.
 */
export function classifyUrlIntakeRoute(input: {
  url: string;
  message?: string | null;
}): UrlIntakeRouteResult {
  let intel: PartnershipUrlIntelligence;
  try {
    intel = parsePartnershipUrl(input.url);
  } catch {
    return {
      route: 'unsupported',
      confidence: 0.9,
      alternatives: [],
      ambiguous: false,
      urlIntel: null,
      signals: [{ name: 'unparseable_url', weight: 0.9, direction: 'unsupported' }],
    };
  }

  const message = (input.message ?? '').trim();
  const { scores, signals } = scoreRoute(intel, message);

  const ranked = (Object.entries(scores) as Array<[IntakeRoute, number]>)
    .filter(([route]) => route !== 'unsupported')
    .sort((a, b) => b[1] - a[1]);

  let [topRoute, topScore] = ranked[0] ?? (['local_discovery', 0] as [IntakeRoute, number]);
  const second = ranked[1];
  const ambiguous =
    second != null && topScore > 0 && second[1] > 0 && topScore - second[1] < 0.15;

  if (topScore === 0) {
    topRoute = 'local_discovery';
    topScore = 0.4;
  }

  // Approved: ambiguous → entity/discovery, never auto-partnership without strong signal.
  if (ambiguous && !hasStrongCreatorBusinessSignal(message)) {
    if (topRoute === 'creator_partnership' || topRoute === 'product_brand_opportunity') {
      topRoute = 'local_discovery';
      topScore = Math.max(second?.[1] ?? 0, 0.45);
    }
  } else if (topRoute === 'product_brand_opportunity') {
    if (hasStrongCreatorBusinessSignal(message) || PROGRAM_PATH_RE.test(intel.originalUrl)) {
      topRoute = 'creator_partnership';
      topScore = Math.max(topScore, 0.85);
    } else {
      // Commerce without strong creator-business evidence → discovery, not partnership.
      topRoute = 'local_discovery';
    }
  }

  // Known URL types outrank brand-slug / commerce heuristics.
  if (scores.social_post >= 0.9) {
    topRoute = 'social_post';
    topScore = scores.social_post;
  } else if (scores.social_profile >= 0.9) {
    topRoute = 'social_profile';
    topScore = scores.social_profile;
  } else if (scores.link_hub >= 0.9) {
    topRoute = 'link_hub';
    topScore = scores.link_hub;
  } else if (scores.event_opportunity >= 0.9) {
    topRoute = 'event_opportunity';
    topScore = scores.event_opportunity;
  }

  const alternatives = ranked
    .filter(([route, score]) => route !== topRoute && score > 0)
    .slice(0, 3)
    .map(([route, score]) => ({
      route,
      confidence: Math.min(score, 1),
      reason: signals.find((s) => s.direction === route)?.name ?? route,
    }));

  return {
    route: topRoute,
    confidence: Math.min(topScore, 1),
    alternatives,
    ambiguous,
    urlIntel: intel,
    signals,
  };
}

export function classifyMessageUrls(message: string): UrlIntakeRouteResult | null {
  const urls = extractUrls(message, 1);
  if (urls.length === 0) return null;
  return classifyUrlIntakeRoute({ url: urls[0]!, message });
}

/** Whether Ask Benson should open the creator partnership pipeline for this message. */
export function shouldRouteToCreatorPartnership(message: string | null | undefined): boolean {
  const text = (message ?? '').trim();
  if (!text) return false;
  if (hasStrongCreatorBusinessSignal(text)) {
    const urls = extractUrls(text, 1);
    if (urls.length === 0) return true;
    const result = classifyUrlIntakeRoute({ url: urls[0]!, message: text });
    return result.route === 'creator_partnership';
  }
  const urls = extractUrls(text, 1);
  if (urls.length === 0) return false;
  return classifyUrlIntakeRoute({ url: urls[0]!, message: text }).route === 'creator_partnership';
}

/**
 * Commerce / brand URLs that should open the creator-opportunity pipeline for discovery
 * even when initial arbitration is local_discovery / product_brand.
 *
 * This is NOT "commerce URL = partnership". It opens a discovery pipeline that may
 * promote/confirm a Creator Partnership after async research finds creator-business evidence.
 * Event and restaurant/local-business hard blocks remain closed.
 */
export function isCreatorOpportunityCandidate(input: {
  url: string;
  message?: string | null;
}): {
  openPipeline: boolean;
  initialRoute: IntakeRoute;
  reason: string;
} {
  const classified = classifyUrlIntakeRoute({
    url: input.url,
    message: input.message,
  });
  const intel = classified.urlIntel;

  if (
    classified.route === 'event_opportunity' ||
    classified.route === 'unsupported' ||
    classified.route === 'social_post' ||
    classified.route === 'social_profile' ||
    classified.route === 'link_hub'
  ) {
    return { openPipeline: false, initialRoute: classified.route, reason: classified.route };
  }

  if (isEditorialRoundupUrl(input.url)) {
    return {
      openPipeline: false,
      initialRoute: classified.route,
      reason: 'editorial_roundup_route',
    };
  }

  if (classified.route === 'creator_partnership') {
    return {
      openPipeline: true,
      initialRoute: 'creator_partnership',
      reason: 'strong_or_program_route',
    };
  }

  if (!intel) {
    return { openPipeline: false, initialRoute: classified.route, reason: 'no_url_intel' };
  }

  const path = intel.originalUrl.toLowerCase();
  if (LOCAL_BUSINESS_PATH_RE.test(path) && !PRODUCT_PATH_RE.test(path) && !CATEGORY_PATH_RE.test(path)) {
    return {
      openPipeline: false,
      initialRoute: classified.route,
      reason: 'local_business_path_block',
    };
  }

  // A path slug or local-publication domain is not partnership evidence.
  const commerceSignals =
    intel.heuristics.some((h) =>
      ['likely_category_path', 'likely_product_path', 'likely_store_filter', 'likely_program_path'].includes(
        h.label,
      ),
    ) ||
    PRODUCT_PATH_RE.test(path) ||
    CATEGORY_PATH_RE.test(path) ||
    intel.storeFilterTokens.length > 0;

  if (commerceSignals) {
    return {
      openPipeline: true,
      initialRoute: classified.route,
      reason: 'commerce_opportunity_candidate',
    };
  }

  return {
    openPipeline: false,
    initialRoute: classified.route,
    reason: 'no_commerce_candidate_signals',
  };
}

/** Open partnership discovery pipeline (direct route OR commerce candidate bridge). */
export function shouldOpenCreatorOpportunityPipeline(
  message: string | null | undefined,
): {
  open: boolean;
  initialRoute: IntakeRoute | null;
  reason: string;
} {
  const text = (message ?? '').trim();
  if (!text) return { open: false, initialRoute: null, reason: 'empty' };

  if (hasStrongCreatorBusinessSignal(text)) {
    const urls = extractUrls(text, 1);
    if (urls.length === 0) {
      return { open: true, initialRoute: 'creator_partnership', reason: 'creator_business_language' };
    }
    const classified = classifyUrlIntakeRoute({ url: urls[0]!, message: text });
    if (
      classified.route === 'event_opportunity' ||
      classified.route === 'social_post' ||
      classified.route === 'social_profile' ||
      classified.route === 'link_hub'
    ) {
      const reason =
        classified.route === 'event_opportunity'
          ? 'event_route'
          : `${classified.route}_overrides_language`;
      return { open: false, initialRoute: classified.route, reason };
    }
    return {
      open: true,
      initialRoute: 'creator_partnership',
      reason: 'creator_business_language',
    };
  }

  const urls = extractUrls(text, 1);
  if (urls.length === 0) return { open: false, initialRoute: null, reason: 'no_url' };

  // Fresh pasted URL wins over any prior conversation partnership context.
  const classified = classifyUrlIntakeRoute({ url: urls[0]!, message: text });
  if (
    classified.route === 'event_opportunity' ||
    classified.route === 'social_post' ||
    classified.route === 'social_profile' ||
    classified.route === 'link_hub'
  ) {
    const reason =
      classified.route === 'event_opportunity' ? 'event_route' : `${classified.route}_route`;
    return { open: false, initialRoute: classified.route, reason };
  }
  if (isEditorialRoundupUrl(urls[0]!)) {
    return { open: false, initialRoute: 'event_opportunity', reason: 'editorial_roundup_route' };
  }

  const candidate = isCreatorOpportunityCandidate({ url: urls[0]!, message: text });
  return {
    open: candidate.openPipeline,
    initialRoute: candidate.initialRoute,
    reason: candidate.reason,
  };
}
