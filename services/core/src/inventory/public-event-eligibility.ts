/**
 * Canonical public-event eligibility authority.
 * Eligibility runs before ranking. Confidence / metadata completeness / discovery
 * recency never make an item eligible. "Needs verification" is a state, not proof.
 */
import type { InventoryItem } from './normalize.js';
import { isPageLevelArchiveTitle } from '../ask-benson/editorial-container.js';
import { isKcMetroLocation, isOutOfMarketLocation } from '../ask-benson/url-geo.js';
import { isOperatorTemporallyCurrent } from '../creator-agent/stale-temporal-prose.js';
import {
  evaluateHomeShowroomGate,
  hasKellieCreatorFit,
  isOrdinaryPublicEvent,
  qualifiesFilmThis,
  qualifiesThingsToDoWeekly,
} from '../pre-alpha/home-showroom-lanes.js';

const POLITICAL_CIVIC_EXCLUDE_RE =
  /\b(democratic|republican|gop|democrat|political\s+party|party\s+banquet|fundraiser|campaign\s+dinner|pac\b|primary\s+election|general\s+election)\b/i;

const PRIVATE_MEMBER_RE =
  /\b(members?\s+only|private\s+event|invitation\s+only|invite[- ]only|closed\s+to\s+public)\b/i;

export type PublicEventLane =
  | 'calendar_suggestion'
  | 'things_to_do_weekly'
  | 'film_this'
  | 'home_best_move';

export type PublicEventEligibilityDecision = {
  /** Base decision: may be considered for any public-event suggestion lane. */
  eligible: boolean;
  rejectionReasonCode: string | null;
  creatorFitSignals: string[];
  audienceValueSignals: string[];
  verificationGaps: string[];
  laneEligibility: Record<PublicEventLane, boolean>;
  /** Explainable components used only after eligibility for ranking. */
  scoreComponents: Record<string, number>;
};

const NARROW_INDUSTRY_RE =
  /\b(?:product\s+fair|summer\s+product\s+fair|veterinary(?:\s+conference)?|\bdvm\d*\b|developers?\s+conference|interventional\s+pain|inland\s+rivers|ports?\s+(?:and|&)\s+terminals|membership[- ]driven|trade\s+association|for\s+(?:members\s+only|healthcare\s+professionals|industry\s+professionals|attending\s+veterinar)|annual\s+conference\s+(?:&|and)\s+expo(?:sition)?|professional\s+development\s+conference)\b/i;

const PUBLIC_AUDIENCE_RE =
  /\b(?:home\s+show|consumer\s+show|boat\s+show|auto\s+show|garden\s+show|concert|festival|community\s+fair|gala|party|jamz|boxing|usa\s+boxing|amateur\s+bouts|tickets|performing\s+arts|family\s+(?:show|friendly)|white\s+linen|sporting|open\s+to\s+(?:the\s+)?public|general\s+admission|musical|theatre|theater|expo)\b/i;

const VISUAL_CONTENT_RE =
  /\b(?:home\s+show|consumer\s+show|demo|demonstration|vendor|giveaway|product\s+coverage|visual|film|photo(?:genic)?|booth|stage|runway|festival|concert|boxing|gala|party)\b/i;

const WEEKEND_FRIENDLY_RE =
  /\b(?:saturday|sunday|weekend|fri(?:day)?(?:\s+night)?|sat(?:urday)?|sun(?:day)?)\b/i;

function haystack(item: Pick<InventoryItem, 'title' | 'summary' | 'summaryRaw' | 'category' | 'venue' | 'locationName' | 'businessName' | 'whyItMatters'>): string {
  return [
    item.title,
    item.summary,
    item.summaryRaw,
    item.category,
    item.venue,
    item.locationName,
    item.businessName,
    item.whyItMatters,
  ]
    .filter(Boolean)
    .join(' ');
}

function tagBlob(item: InventoryItem): string {
  const meta = item.metadata ?? {};
  const tags = Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [];
  const opportunity =
    typeof meta.opportunityCategory === 'string' ? meta.opportunityCategory : '';
  return `${tags.join(' ')} ${opportunity}`;
}

export function collectAudienceValueSignals(item: InventoryItem): string[] {
  const signals: string[] = [];
  const hay = `${haystack(item)} ${tagBlob(item)}`;
  if (PUBLIC_AUDIENCE_RE.test(hay)) signals.push('public_audience_language');
  if (/\bhome\s+show\b/i.test(hay)) signals.push('consumer_home_expo');
  if (/\b(?:boxing|amateur\s+bouts|sporting)\b/i.test(hay)) signals.push('public_sporting');
  if (/\b(?:concert|musical|theatre|theater|performing\s+arts)\b/i.test(hay)) signals.push('public_performance');
  if (/\b(?:gala|party|jamz|white\s+linen)\b/i.test(hay)) signals.push('public_social');
  if (item.flags?.freeEvent) signals.push('free_event');
  if (item.flags?.dateNight) signals.push('date_night');
  if (isOrdinaryPublicEvent(item)) signals.push('ordinary_public_event');
  return signals;
}

export function collectCreatorFitSignals(item: InventoryItem): string[] {
  const signals: string[] = [];
  if (hasKellieCreatorFit(item)) signals.push('kellie_creator_fit');
  if (item.flags?.shopping || item.flags?.retail) signals.push('shopping_retail');
  if (item.flags?.sponsorFriendly) signals.push('sponsor_friendly');
  if (item.flags?.luxury) signals.push('luxury');
  if (VISUAL_CONTENT_RE.test(haystack(item))) signals.push('visual_content_potential');
  if (/\b(?:vendor|sponsor|booth|demo|interview|giveaway)\b/i.test(haystack(item))) {
    signals.push('vendor_sponsor_contact');
  }
  return signals;
}

export function collectVerificationGaps(item: InventoryItem): string[] {
  const gaps: string[] = [];
  const startTime =
    item.temporalEvidence?.startTime ??
    (typeof item.metadata?.extracted === 'object' &&
    item.metadata.extracted &&
    typeof (item.metadata.extracted as { startTime?: unknown }).startTime === 'string'
      ? (item.metadata.extracted as { startTime: string }).startTime
      : null);
  if (!startTime?.trim()) gaps.push('missing_start_time');
  if (!item.venue?.trim() && !item.locationName?.trim() && !item.formattedAddress?.trim()) {
    gaps.push('missing_location');
  }
  if (!item.sourceUrl?.trim()) gaps.push('missing_source_url');
  return gaps;
}

function isNarrowIndustryWithoutPublicAngle(item: InventoryItem, audienceSignals: string[]): boolean {
  const hay = `${haystack(item)} ${tagBlob(item)}`;
  if (!NARROW_INDUSTRY_RE.test(hay) && !/\b(?:trade\s+show|industry)\b/i.test(tagBlob(item))) {
    return false;
  }
  // Industry language alone is fine when clear public/consumer signals exist.
  if (audienceSignals.some((s) => s !== 'ordinary_public_event')) return false;
  if (/\b(?:trade\s+show|industry|conference)\b/i.test(tagBlob(item)) && !PUBLIC_AUDIENCE_RE.test(hay)) {
    return true;
  }
  return NARROW_INDUSTRY_RE.test(hay);
}

/**
 * Shared base public-event decision + explicit lane policies.
 * Callers must check `laneEligibility[lane]` (not only `eligible`) for their surface.
 */
export function evaluatePublicEventEligibility(
  item: InventoryItem,
  now: Date = new Date(),
): PublicEventEligibilityDecision {
  const creatorFitSignals = collectCreatorFitSignals(item);
  const audienceValueSignals = collectAudienceValueSignals(item);
  const verificationGaps = collectVerificationGaps(item);
  const emptyLanes: Record<PublicEventLane, boolean> = {
    calendar_suggestion: false,
    things_to_do_weekly: false,
    film_this: false,
    home_best_move: false,
  };

  const reject = (code: string): PublicEventEligibilityDecision => ({
    eligible: false,
    rejectionReasonCode: code,
    creatorFitSignals,
    audienceValueSignals,
    verificationGaps,
    laneEligibility: emptyLanes,
    scoreComponents: {},
  });

  if (!item.eventDate) return reject('no_date');
  if (item.lifecycleStatus === 'expired' || item.lifecycleStatus === 'archived') {
    return reject('lifecycle_inactive');
  }
  if (item.creatorValueStatus === 'rejected' || item.creatorValueStatus === 'archived') {
    return reject('creator_value_suppressed');
  }
  if (isPageLevelArchiveTitle(item.title)) return reject('page_level_archive_title');
  if (item.metadata?.editorialContainer === true && item.metadata?.containerChild !== true) {
    return reject('editorial_container_parent');
  }
  if (item.metadata?.calendarEligible === false) return reject('calendar_marked_ineligible');
  if (
    !isOperatorTemporallyCurrent({
      startsAt: item.eventDate,
      endsAt: item.eventEndDate,
      summaryText: item.summaryRaw ?? item.summary,
      now,
    })
  ) {
    return reject('not_temporally_current');
  }
  if (POLITICAL_CIVIC_EXCLUDE_RE.test(haystack(item))) return reject('political_civic');
  if (PRIVATE_MEMBER_RE.test(haystack(item))) return reject('private_or_member_only');

  const placeCore = [item.venue, item.locationName, item.businessName, item.formattedAddress]
    .filter(Boolean)
    .join(' ');
  // Venue/address authority — do not let "KC" in the title keep Chicago/Seattle/Miami venues.
  if (placeCore && isOutOfMarketLocation(placeCore)) {
    return reject('out_of_market');
  }
  const place = [
    item.title,
    item.summary,
    item.venue,
    item.locationName,
    item.businessName,
    item.formattedAddress,
    item.sourceName,
  ]
    .filter(Boolean)
    .join(' ');
  if (isOutOfMarketLocation(place) && !isKcMetroLocation(place)) {
    return reject('out_of_market');
  }
  if (isOutOfMarketLocation(item.title ?? '') && !isKcMetroLocation(item.title ?? '')) {
    return reject('out_of_market');
  }

  if (isNarrowIndustryWithoutPublicAngle(item, audienceValueSignals)) {
    return reject('narrow_industry_no_audience_value');
  }

  const concreteLocal =
    Boolean(item.venue?.trim() || item.locationName?.trim() || item.formattedAddress?.trim()) ||
    isKcMetroLocation(place);
  const hasAudienceOrCreator =
    audienceValueSignals.length > 0 || creatorFitSignals.length > 0 || isOrdinaryPublicEvent(item);
  if (!hasAudienceOrCreator && !concreteLocal) {
    return reject('no_audience_or_creator_angle');
  }

  const thingsToDo =
    qualifiesThingsToDoWeekly(item, now) ||
    audienceValueSignals.includes('consumer_home_expo') ||
    audienceValueSignals.includes('public_sporting') ||
    audienceValueSignals.includes('public_performance') ||
    audienceValueSignals.includes('public_social') ||
    (audienceValueSignals.includes('public_audience_language') && hasAudienceOrCreator);
  const filmThis = qualifiesFilmThis(item, now);
  const homeBest = evaluateHomeShowroomGate(item, now).eligible;
  // Calendar: dated local public events OK; niche industry already rejected above.
  const calendarSuggestion =
    thingsToDo || filmThis || creatorFitSignals.length > 0 || audienceValueSignals.length > 0 || concreteLocal;

  const scoreComponents: Record<string, number> = {
    audienceRelevance: Math.min(40, audienceValueSignals.length * 10 + (thingsToDo ? 10 : 0)),
    visualFilmingValue: Math.min(25, (creatorFitSignals.includes('visual_content_potential') ? 15 : 0) + (filmThis ? 10 : 0)),
    creatorAngle: Math.min(20, creatorFitSignals.length * 5),
    localUsefulness: isKcMetroLocation(place) || /kansas city|\bkc\b/i.test(place) ? 15 : 5,
    weekendTiming: WEEKEND_FRIENDLY_RE.test(haystack(item)) || isWeekendStart(item.eventDate) ? 10 : 0,
    logisticsAdequacy: Math.max(0, 10 - verificationGaps.length * 3),
    narrowIndustryPenalty: isNarrowIndustryWithoutPublicAngle(item, audienceValueSignals) ? -40 : 0,
    // Explicitly unused for eligibility; kept at 0 so callers cannot mistake them for usefulness.
    discoveryRecency: 0,
    metadataConfidence: 0,
    ingestionOrder: 0,
  };

  return {
    eligible: true,
    rejectionReasonCode: null,
    creatorFitSignals,
    audienceValueSignals,
    verificationGaps,
    laneEligibility: {
      calendar_suggestion: calendarSuggestion,
      things_to_do_weekly: Boolean(thingsToDo),
      film_this: filmThis,
      home_best_move: homeBest,
    },
    scoreComponents,
  };
}

function isWeekendStart(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
  }).format(d);
  return day === 'Fri' || day === 'Sat' || day === 'Sun';
}

/** Rank only after eligibility. Higher is better. */
export function rankPublicEventScore(decision: PublicEventEligibilityDecision): number {
  if (!decision.eligible) return Number.NEGATIVE_INFINITY;
  return Object.entries(decision.scoreComponents)
    .filter(([key]) => !['discoveryRecency', 'metadataConfidence', 'ingestionOrder'].includes(key))
    .reduce((sum, [, value]) => sum + value, 0);
}

export function isPublicEventLaneEligible(
  item: InventoryItem,
  lane: PublicEventLane,
  now: Date = new Date(),
): boolean {
  const decision = evaluatePublicEventEligibility(item, now);
  return decision.laneEligibility[lane] === true;
}
