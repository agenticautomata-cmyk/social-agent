import type { ExtractedOpportunity } from './listing-extract.js';
import { parseEventDate } from './listing-extract.js';
import {
  isKcMetroLocation,
  isOutOfMarketLocation,
  matchesLocationScope,
} from './url-geo.js';
import { hasExplicitPastEventDate } from '../inventory/content-freshness.js';
import { isOpaqueContentId } from './url-type.js';

export type QualificationRejectionCode =
  | 'past_event'
  | 'out_of_market'
  | 'generic_title'
  | 'map_search_source'
  | 'missing_entity_match'
  | 'weak_location'
  | 'location_scope_mismatch'
  | 'no_creator_action'
  | 'unsupported_evidence'
  | 'low_confidence';

export type UrlQualificationResult = {
  qualified: boolean;
  rejectionCode?: QualificationRejectionCode;
  rejectionReason?: string;
  forcedRelevanceScore: number;
  forcedUrgencyScore: number;
};

const GENERIC_TITLE_RE =
  /^(new event starts?|event starts?|upcoming event|special event|event details?|tbd|unknown event|new event|event update|calendar event|placeholder)\.?$/i;

const MAP_URL_RE =
  /(?:google\.com\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl)/i;

export function isMapSearchUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return MAP_URL_RE.test(url);
}

export function isGenericExtractedTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 4) return true;
  if (GENERIC_TITLE_RE.test(t)) return true;
  if (/^(event|update|news|info|details?)$/i.test(t)) return true;
  return false;
}

export function isPastEventDate(date: Date | null): boolean {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export type ResolvedUrlEntity = {
  businessName: string | null;
  domain: string;
  officialDomain: string;
  locations: string[];
  multiLocation: boolean;
};

export function resolveEntityFromUrl(pageUrl: string, pageTitle?: string | null): ResolvedUrlEntity {
  let domain = pageUrl;
  try {
    domain = new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    // keep raw
  }
  const titleCandidate = pageTitle?.replace(/\s*[-|].*$/, '').trim();
  const businessName =
    (titleCandidate && !isOpaqueContentId(titleCandidate) ? titleCandidate : null) ||
    domain.split('.')[0]?.replace(/-/g, ' ') ||
    null;
  return {
    businessName,
    domain,
    officialDomain: domain,
    locations: [],
    multiLocation: false,
  };
}

export function detectLocationsInText(text: string): string[] {
  const found = new Map<string, string>();
  const patterns = [
    /\b(lenexa)\b/gi,
    /\b(overland park)\b/gi,
    /\b(kansas city)\b/gi,
    /\b(tulsa)\b/gi,
    /\b(oklahoma city)\b/gi,
    /\b(st\.?\s*louis)\b/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const label = m[1]!.trim();
      found.set(label.toLowerCase(), label);
    }
  }
  return [...found.values()];
}

export function qualifyUrlOpportunity(input: {
  opp: ExtractedOpportunity;
  pageUrl: string;
  sourceUrl: string;
  entity: ResolvedUrlEntity;
  locationScope?: string | null;
  userRequestedMarket?: string | null;
  pageText?: string | null;
  directoryListing?: boolean;
  eventListing?: boolean;
  staleEditorialRoundup?: boolean;
}): UrlQualificationResult {
  const forced = { forcedRelevanceScore: 0, forcedUrgencyScore: 0 };
  const location = [input.opp.location, input.opp.venue, input.opp.businessName]
    .filter(Boolean)
    .join(' ');

  if (isGenericExtractedTitle(input.opp.title)) {
    return {
      qualified: false,
      rejectionCode: 'generic_title',
      rejectionReason: `Generic or placeholder title "${input.opp.title}" is not actionable.`,
      ...forced,
    };
  }

  if (isMapSearchUrl(input.sourceUrl) || isMapSearchUrl(input.opp.sourceUrl ?? undefined)) {
    return {
      qualified: false,
      rejectionCode: 'map_search_source',
      rejectionReason: 'Google Maps search URLs are not official event evidence.',
      ...forced,
    };
  }

  const eventDate = parseEventDate(input.opp.eventDate);
  if (eventDate && isPastEventDate(eventDate)) {
    return {
      qualified: false,
      rejectionCode: 'past_event',
      rejectionReason: `Event date ${input.opp.eventDate} is in the past and cannot be presented as upcoming.`,
      ...forced,
    };
  }

  if (input.staleEditorialRoundup && (!eventDate || isPastEventDate(eventDate))) {
    return {
      qualified: false,
      rejectionCode: 'past_event',
      rejectionReason: 'Dated editorial roundup is stale for current planning.',
      ...forced,
    };
  }

  const datedCopy = [input.opp.title, input.opp.summary, input.opp.eventDate].filter(Boolean).join(' ');
  if ((!eventDate || isPastEventDate(eventDate)) && hasExplicitPastEventDate(datedCopy)) {
    return {
      qualified: false,
      rejectionCode: 'past_event',
      rejectionReason: 'Item cites a past month/year and cannot be presented as upcoming.',
      ...forced,
    };
  }

  const scope = input.locationScope ?? input.userRequestedMarket ?? 'Kansas City metro';
  const userAskedOtherMarket = Boolean(
    input.userRequestedMarket && !/kansas city|\bkc\b|lenexa|metro/i.test(input.userRequestedMarket),
  );

  if (!userAskedOtherMarket && isOutOfMarketLocation(location)) {
    return {
      qualified: false,
      rejectionCode: 'out_of_market',
      rejectionReason: `Location "${location.trim()}" is outside the Kansas City metro scope.`,
      ...forced,
    };
  }

  if (input.locationScope && location && !matchesLocationScope(location, input.locationScope)) {
    return {
      qualified: false,
      rejectionCode: 'location_scope_mismatch',
      rejectionReason: `Location "${location.trim()}" does not match watch scope "${input.locationScope}".`,
      ...forced,
    };
  }

  if (
    !userAskedOtherMarket &&
    !input.locationScope &&
    input.entity.multiLocation &&
    location &&
    !isKcMetroLocation(location)
  ) {
    return {
      qualified: false,
      rejectionCode: 'location_scope_mismatch',
      rejectionReason: `Multi-location business — "${location}" needs explicit branch scope before saving.`,
      ...forced,
    };
  }

  if (!location.trim() && eventDate) {
    return {
      qualified: false,
      rejectionCode: 'weak_location',
      rejectionReason: 'Date-dependent event missing a verifiable location.',
      ...forced,
    };
  }

  if ((input.opp.confidence ?? 0) < 0.35 && !input.opp.eventDate && !location.trim()) {
    return {
      qualified: false,
      rejectionCode: 'low_confidence',
      rejectionReason: 'Extraction confidence too low with no date or location evidence.',
      ...forced,
    };
  }

  // Listing pages contain independently named events (Fusion Fest on theosc.co).
  // Do not require each row to match the page/host business token.
  if (
    !input.eventListing &&
    !input.directoryListing &&
    input.entity.businessName &&
    input.opp.businessName &&
    !input.opp.businessName.toLowerCase().includes(input.entity.businessName.split(' ')[0]!.toLowerCase()) &&
    !input.opp.title.toLowerCase().includes(input.entity.businessName.split(' ')[0]!.toLowerCase())
  ) {
    return {
      qualified: false,
      rejectionCode: 'missing_entity_match',
      rejectionReason: `Extracted item does not match identified business "${input.entity.businessName}".`,
      ...forced,
    };
  }

  return { qualified: true, forcedRelevanceScore: 0, forcedUrgencyScore: 0 };
}
