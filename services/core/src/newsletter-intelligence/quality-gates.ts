import { isKcMetroLocation, isOutOfMarketLocation } from '../ask-benson/url-geo.js';
import type { ExtractedNewsletterItem } from './types.js';
import type { LocationOutcome, LocationResolutionResult } from './location-resolve.js';
import { resolveNewsletterLocation } from './location-resolve.js';
import { shouldRejectAsNewsSignal } from './news-exclusions.js';

export type QualityGateResult =
  | { accept: true; locationOutcome: LocationOutcome; locationLabel: string | null }
  | { accept: false; reason: string; quarantine: boolean; locationOutcome?: LocationOutcome };

const BOILERPLATE_PATTERNS = [
  /^click here$/i,
  /^read more$/i,
  /^view in browser$/i,
  /^unsubscribe$/i,
  /^privacy policy$/i,
  /^manage preferences$/i,
  /^follow us on/i,
  /^share this email/i,
  /^update your preferences/i,
  /^view online version/i,
];

const FOOTER_EVENT_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bprivacy\b/i,
  /\bterms of service\b/i,
  /\bcopyright\b/i,
];

const GENERIC_TITLE_PATTERNS = [
  /^newsletter events?$/i,
  /^this week$/i,
  /^events?$/i,
  /^deals?$/i,
  /^click here$/i,
  /^learn more$/i,
  /^view event$/i,
];

const MAP_SEARCH_URL =
  /google\.com\/maps\/search|maps\.google\.com\/\?.*(?:q=|query=)|goo\.gl\/maps/i;

const VIRTUAL_PATTERNS = /\b(?:virtual|online only|livestream|zoom webinar|streaming)\b/i;

export function evaluateNewsletterItem(
  item: ExtractedNewsletterItem,
  ctx?: {
    subject?: string;
    bodyText?: string;
    senderDomain?: string;
    locationResolution?: LocationResolutionResult;
  },
): QualityGateResult {
  const title = item.title.trim();
  const entity = item.entityName.trim();

  if (!entity || entity.length < 2) {
    return { accept: false, reason: 'missing_entity_identity', quarantine: true };
  }
  if (!title || title.length < 3) {
    return { accept: false, reason: 'missing_title', quarantine: true };
  }
  if (GENERIC_TITLE_PATTERNS.some((p) => p.test(title))) {
    return { accept: false, reason: 'generic_title', quarantine: true };
  }
  if (BOILERPLATE_PATTERNS.some((p) => p.test(title)) || BOILERPLATE_PATTERNS.some((p) => p.test(entity))) {
    return { accept: false, reason: 'navigation_boilerplate', quarantine: true };
  }
  if (FOOTER_EVENT_PATTERNS.some((p) => p.test(title)) && title.length < 40) {
    return { accept: false, reason: 'footer_boilerplate', quarantine: true };
  }

  const newsReject = shouldRejectAsNewsSignal({
    subject: ctx?.subject ?? '',
    bodyText: ctx?.bodyText,
    item,
    senderDomain: ctx?.senderDomain ?? '',
  });
  if (newsReject) {
    return { accept: false, reason: newsReject.reason, quarantine: false };
  }

  const location = ctx?.locationResolution ?? resolveNewsletterLocation(item, {
    senderDomain: ctx?.senderDomain,
    bodyText: ctx?.bodyText,
  });

  if (location.outcome === 'out_of_market') {
    return {
      accept: false,
      reason: 'out_of_market',
      quarantine: false,
      locationOutcome: location.outcome,
    };
  }

  if (location.outcome === 'national_no_local_proof') {
    return {
      accept: false,
      reason: 'national_retail_no_local_proof',
      quarantine: false,
      locationOutcome: location.outcome,
    };
  }

  const url = item.sourceUrl ?? item.ticketLink ?? item.reservationLink ?? item.officialWebsite;
  if (url && MAP_SEARCH_URL.test(url)) {
    return { accept: false, reason: 'map_search_url', quarantine: true };
  }

  if (item.startDate) {
    const parsed = Date.parse(item.startDate);
    if (Number.isNaN(parsed)) {
      return { accept: false, reason: 'malformed_date', quarantine: true };
    }
    const daysPast = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
    if (daysPast > 14 && item.layer === 'occurrence') {
      return { accept: false, reason: 'expired_occurrence', quarantine: false };
    }
  }

  if (item.confidence < 0.25) {
    return { accept: false, reason: 'low_confidence', quarantine: true };
  }

  return {
    accept: true,
    locationOutcome: location.outcome,
    locationLabel: location.label,
  };
}

export function buildLocationLabel(item: ExtractedNewsletterItem): string | null {
  const parts = [
    item.venue,
    item.streetAddress,
    item.neighborhood,
    item.city,
    item.state,
    item.zipCode,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const joined = parts.join(', ');
  if (isKcMetroLocation(joined)) return joined;
  if (
    item.city &&
    /lenexa|overland park|olathe|shawnee|leawood|prairie village|merriam|independence|lee'?s summit|blue springs|liberty|north kansas city|gladstone|belton|raymore/i.test(
      item.city,
    )
  ) {
    return joined;
  }
  return joined || null;
}

export function isPhysicalEventRequiringLocation(item: ExtractedNewsletterItem): boolean {
  if (item.layer !== 'occurrence' || !item.startDate) return false;
  if (VIRTUAL_PATTERNS.test(`${item.title} ${item.description ?? ''} ${item.venue ?? ''}`)) return false;
  return true;
}

export function calendarEligible(
  item: ExtractedNewsletterItem,
  gate: QualityGateResult,
  verificationStatus: string,
): boolean {
  if (!gate.accept) return false;
  if (item.layer !== 'occurrence' || !item.startDate) return false;
  if (item.occurrenceType === 'sale' || item.occurrenceType === 'product_release') return false;
  if (gate.locationOutcome === 'national_no_local_proof') return false;

  const hasVerifiedEvidence =
    verificationStatus.startsWith('official_') ||
    verificationStatus === 'trusted_secondary_source' ||
    verificationStatus === 'verified' ||
    verificationStatus === 'partially_verified';

  if (!hasVerifiedEvidence && verificationStatus === 'newsletter_only') {
    return false;
  }

  if (isPhysicalEventRequiringLocation(item)) {
    if (
      gate.locationOutcome !== 'exact_kc_metro' &&
      gate.locationOutcome !== 'virtual_not_applicable'
    ) {
      return false;
    }
    const loc = gate.locationLabel ?? buildLocationLabel(item);
    if (!loc && gate.locationOutcome !== 'virtual_not_applicable') {
      return false;
    }
  }

  const parsed = Date.parse(item.startDate);
  if (Number.isNaN(parsed) || parsed < Date.now() - 86400000) return false;

  return true;
}
