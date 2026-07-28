import { isKcMetroLocation, isOutOfMarketLocation } from '../ask-benson/url-geo.js';
import { normalizeBusinessKey } from '../creator-interest/normalize.js';
import type { ExtractedNewsletterItem } from './types.js';

export type LocationOutcome =
  | 'exact_kc_metro'
  | 'kc_metro_branch_unresolved'
  | 'national_no_local_proof'
  | 'out_of_market'
  | 'location_unknown'
  | 'virtual_not_applicable';

export type LocationResolutionResult = {
  outcome: LocationOutcome;
  label: string | null;
  city: string | null;
  state: string | null;
  venue: string | null;
  streetAddress: string | null;
  neighborhood: string | null;
  zipCode: string | null;
  evidenceSources: string[];
  confidence: number;
};

const KC_METRO_CITIES =
  /kansas city|overland park|olathe|lenexa|shawnee|leawood|prairie village|merriam|independence|lee'?s summit|blue springs|liberty|north kansas city|gladstone|belton|raymore|grandview|raytown|mission|roeland park|fairway|parkville|leavenworth|lawrence|topeka/i;

const NATIONAL_CHAIN_PATTERNS =
  /\b(?:target|walmart|five below|urban planet|old navy|gap|macy'?s|kohl'?s|best buy|costco|sam'?s club|dick'?s sporting|home depot|lowe'?s|starbucks|mcdonald'?s|chipotle|panera|forever\s*21|hollister|abercrombie)\b/i;

const VIRTUAL_PATTERNS = /\b(?:virtual|online only|livestream|zoom webinar|streaming)\b/i;

/** Known local venues / sender domains → KC city defaults. */
const KNOWN_LOCAL_VENUES: Array<{ match: RegExp; venue: string; city: string; state: string }> = [
  { match: /\bvine street brewing\b/i, venue: 'Vine Street Brewing', city: 'Kansas City', state: 'MO' },
  { match: /\bcrossroads(?:kc)?\b/i, venue: 'CrossroadsKC', city: 'Kansas City', state: 'MO' },
];

const KNOWN_LOCAL_SENDER_DOMAINS: Record<string, { city: string; state: string; defaultVenue?: string }> = {
  'vinestbrewing.com': { city: 'Kansas City', state: 'MO', defaultVenue: 'Vine Street Brewing' },
  'vinestreetbrewing.com': { city: 'Kansas City', state: 'MO', defaultVenue: 'Vine Street Brewing' },
  'do816.com': { city: 'Kansas City', state: 'MO' },
  'thepitchkc.com': { city: 'Kansas City', state: 'MO' },
  'visitkc.com': { city: 'Kansas City', state: 'MO' },
  'marketing.visitkc.com': { city: 'Kansas City', state: 'MO' },
  'madeinkc.co': { city: 'Kansas City', state: 'MO' },
  'boostkc.org': { city: 'Kansas City', state: 'MO' },
};

function collectEvidenceSources(item: ExtractedNewsletterItem, ctx?: {
  senderLocationPage?: string | null;
  structuredMetadata?: Record<string, string | null>;
}): string[] {
  const sources: string[] = [];
  if (item.streetAddress || item.city || item.venue) sources.push('email_text');
  if (item.officialWebsite || item.sourceUrl) sources.push('official_linked_page');
  if (ctx?.senderLocationPage) sources.push('sender_location_page');
  if (ctx?.structuredMetadata && Object.values(ctx.structuredMetadata).some(Boolean)) {
    sources.push('structured_metadata');
  }
  return sources;
}

export function resolveNewsletterLocation(
  item: ExtractedNewsletterItem,
  ctx?: {
    senderDomain?: string;
    senderName?: string | null;
    bodyText?: string;
    senderLocationPage?: string | null;
    googleMapsEvidence?: { address?: string | null; city?: string | null } | null;
    structuredMetadata?: Record<string, string | null>;
    knownEntityLocation?: { city?: string | null; venue?: string | null; address?: string | null } | null;
  },
): LocationResolutionResult {
  const evidenceSources = collectEvidenceSources(item, ctx);
  const isVirtual = VIRTUAL_PATTERNS.test(
    `${item.title} ${item.description ?? ''} ${item.venue ?? ''}`,
  );

  if (isVirtual) {
    return {
      outcome: 'virtual_not_applicable',
      label: 'Virtual / online',
      city: null,
      state: null,
      venue: item.venue,
      streetAddress: null,
      neighborhood: null,
      zipCode: null,
      evidenceSources: [...evidenceSources, 'virtual_event'],
      confidence: 0.9,
    };
  }

  let city = item.city;
  let state = item.state;
  let venue = item.venue;
  let streetAddress = item.streetAddress;
  let neighborhood = item.neighborhood;
  let zipCode = item.zipCode;

  if (!city && ctx?.knownEntityLocation?.city) {
    city = ctx.knownEntityLocation.city;
    evidenceSources.push('benson_entity_record');
  }
  if (!venue && ctx?.knownEntityLocation?.venue) {
    venue = ctx.knownEntityLocation.venue;
    evidenceSources.push('benson_entity_record');
  }
  if (!streetAddress && ctx?.knownEntityLocation?.address) {
    streetAddress = ctx.knownEntityLocation.address;
    evidenceSources.push('benson_entity_record');
  }

  if ((!city || !streetAddress) && ctx?.googleMapsEvidence) {
    if (!city && ctx.googleMapsEvidence.city) {
      city = ctx.googleMapsEvidence.city;
      evidenceSources.push('google_maps_evidence');
    }
    if (!streetAddress && ctx.googleMapsEvidence.address) {
      streetAddress = ctx.googleMapsEvidence.address;
      evidenceSources.push('google_maps_evidence');
    }
  }

  // Known local venues / sender domains fill KC city before out-of-market checks.
  const venueBlob = `${venue ?? ''} ${item.entityName} ${item.title}`;
  for (const known of KNOWN_LOCAL_VENUES) {
    if (known.match.test(venueBlob)) {
      venue = venue ?? known.venue;
      if (!city) {
        city = known.city;
        state = state ?? known.state;
        evidenceSources.push('known_local_venue');
      }
      break;
    }
  }
  const senderRoot = (ctx?.senderDomain ?? '').replace(/^www\./, '').toLowerCase();
  const senderKnown = KNOWN_LOCAL_SENDER_DOMAINS[senderRoot];
  if (senderKnown) {
    if (!city) {
      city = senderKnown.city;
      state = state ?? senderKnown.state;
      evidenceSources.push('known_local_sender');
    }
    if (!venue && senderKnown.defaultVenue && /life of the party|vine street/i.test(`${item.title} ${item.entityName}`)) {
      venue = senderKnown.defaultVenue;
      evidenceSources.push('known_local_sender');
    }
  }

  const locationBlob = [venue, streetAddress, neighborhood, city, state, zipCode, item.description, item.title]
    .filter(Boolean)
    .join(' ');

  if (locationBlob && isOutOfMarketLocation(locationBlob)) {
    return {
      outcome: 'out_of_market',
      label: buildLabel(venue, streetAddress, neighborhood, city, state, zipCode),
      city,
      state,
      venue,
      streetAddress,
      neighborhood,
      zipCode,
      evidenceSources,
      confidence: 0.85,
    };
  }

  const hasExplicitLocation = Boolean(city || streetAddress || venue);
  const isKcMetro = locationBlob ? isKcMetroLocation(locationBlob) : false;
  const isNationalChain = NATIONAL_CHAIN_PATTERNS.test(item.entityName) || NATIONAL_CHAIN_PATTERNS.test(item.title);
  // National chains need a KC metro city/address — a brand-name venue alone is not local proof.
  const hasNationalLocalProof = Boolean(
    (city && KC_METRO_CITIES.test(city)) ||
      (streetAddress && isKcMetroLocation(`${streetAddress} ${city ?? ''}`)) ||
      (venue && city && KC_METRO_CITIES.test(city)),
  );

  if (isNationalChain && !hasNationalLocalProof) {
    return {
      outcome: 'national_no_local_proof',
      label: hasExplicitLocation ? buildLabel(venue, streetAddress, neighborhood, city, state, zipCode) : null,
      city,
      state,
      venue,
      streetAddress,
      neighborhood,
      zipCode,
      evidenceSources,
      confidence: 0.7,
    };
  }

  if (hasExplicitLocation && isKcMetro) {
    return {
      outcome: 'exact_kc_metro',
      label: buildLabel(venue, streetAddress, neighborhood, city, state, zipCode),
      city,
      state,
      venue,
      streetAddress,
      neighborhood,
      zipCode,
      evidenceSources,
      confidence: city && streetAddress ? 0.9 : 0.75,
    };
  }

  if (hasExplicitLocation && city && KC_METRO_CITIES.test(city)) {
    return {
      outcome: 'exact_kc_metro',
      label: buildLabel(venue, streetAddress, neighborhood, city, state, zipCode),
      city,
      state,
      venue,
      streetAddress,
      neighborhood,
      zipCode,
      evidenceSources,
      confidence: 0.8,
    };
  }

  if (hasExplicitLocation && !isKcMetro) {
    // Venue-only without a non-KC city is unknown — not out-of-market.
    // Reserve out_of_market for explicit foreign cities / OUT_OF_MARKET_RE hits above.
    if (city && !KC_METRO_CITIES.test(city)) {
      return {
        outcome: 'out_of_market',
        label: buildLabel(venue, streetAddress, neighborhood, city, state, zipCode),
        city,
        state,
        venue,
        streetAddress,
        neighborhood,
        zipCode,
        evidenceSources,
        confidence: 0.8,
      };
    }
    if (venue && !city && !streetAddress) {
      return {
        outcome: 'location_unknown',
        label: venue,
        city: null,
        state: null,
        venue,
        streetAddress: null,
        neighborhood: null,
        zipCode: null,
        evidenceSources,
        confidence: 0.45,
      };
    }
  }

  // Title/entity mentions a KC metro token without structured fields.
  if (!hasExplicitLocation && isKcMetroLocation(`${item.title} ${item.entityName} ${item.description ?? ''}`)) {
    return {
      outcome: 'kc_metro_branch_unresolved',
      label: 'Kansas City, MO',
      city: 'Kansas City',
      state: 'MO',
      venue,
      streetAddress: null,
      neighborhood: null,
      zipCode: null,
      evidenceSources: [...evidenceSources, 'title_kc_signal'],
      confidence: 0.55,
    };
  }

  const senderSuggestsKc =
    ctx?.senderDomain &&
    /visitkc|kansascity|kc\b|madeinkc|boostkc|pitchkc|do816|flatland/i.test(ctx.senderDomain);
  if (senderSuggestsKc && !hasExplicitLocation) {
    return {
      outcome: 'kc_metro_branch_unresolved',
      label: null,
      city: 'Kansas City',
      state: 'MO',
      venue,
      streetAddress: null,
      neighborhood: null,
      zipCode: null,
      evidenceSources: [...evidenceSources, 'sender_kc_context'],
      confidence: 0.45,
    };
  }

  return {
    outcome: 'location_unknown',
    label: null,
    city,
    state,
    venue,
    streetAddress,
    neighborhood,
    zipCode,
    evidenceSources,
    confidence: 0.2,
  };
}

function buildLabel(
  venue: string | null,
  streetAddress: string | null,
  neighborhood: string | null,
  city: string | null,
  state: string | null,
  zipCode: string | null,
): string | null {
  const parts = [venue, streetAddress, neighborhood, city, state, zipCode].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function applyLocationToItem(
  item: ExtractedNewsletterItem,
  resolution: LocationResolutionResult,
): ExtractedNewsletterItem {
  return {
    ...item,
    city: resolution.city ?? item.city,
    state: resolution.state ?? item.state,
    venue: resolution.venue ?? item.venue,
    streetAddress: resolution.streetAddress ?? item.streetAddress,
    neighborhood: resolution.neighborhood ?? item.neighborhood,
    zipCode: resolution.zipCode ?? item.zipCode,
  };
}

export function entityLocationKey(entityName: string): string {
  return normalizeBusinessKey(entityName);
}
