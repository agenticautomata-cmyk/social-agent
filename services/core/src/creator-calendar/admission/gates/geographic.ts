import { isKcMetroLocation, isOutOfMarketLocation } from '../../../ask-benson/url-geo.js';
import type { CalendarAdmissionCandidate, CalendarAdmissionReasonCode } from '../types.js';

/** Established KC-metro venues that count as affirmative local place evidence. */
const ESTABLISHED_KC_VENUE_RE =
  /\b(?:t-?mobile\s+center|kemper\s+arena|arrowhead|kauffman\s+stadium|union\s+station|science\s+city|crown\s+center|power\s*(?:&|and)\s*light|midland\s+theatre|folly\s+theater|uptown\s+theater|recordbar|the\s+record\s+bar|crossroads|westport|country\s+club\s+plaza|overland\s+park\s+convention\s+center|\bopcc\b|johnson\s+county\s+community\s+college|\bjccc\b|yard\s+bar|juke\s+house|woody'?s|hooked\s+on\s+kc|starlight\s+theatre|americas?\s+community\s+center|legends\s+outlets|kansas\s+city\s+zoo|nelson-?atkins|kemper\s+museum|worlds?\s+of\s+fun|oceans?\s+of\s+fun|loose\s+park|boulevardia|18th\s+(?:and|&)\s*vine|lakeside\s+nature\s+center)\b/i;

/** Known out-of-market arenas / halls (even when city omitted or truncated). */
const KNOWN_OOM_VENUE_RE =
  /\b(?:american\s+airlines\s+center|\baac\b|madison\s+square\s+garden|\bmsg\b|red\s+rocks(?:\s+amphitheatre)?|crypto\.com\s+arena|united\s+center|ball\s+arena|chase\s+center|barclays\s+center)\b/i;

const INTERNATIONAL_PLACE_RE =
  /\b(?:amsterdam|berlin|london|paris|dublin|toronto|vancouver|montreal|sydney|melbourne|tokyo|osaka|seoul|mexico\s+city|netherlands|germany|england|uk|france|ireland|canada|australia|japan)\b/i;

const BARE_CITY_ONLY_RE =
  /^(?:kansas\s+city(?:\s*,?\s*(?:mo|kansas|ks))?|kc(?:\s*,?\s*mo)?)$/i;

/** Metro locality names that are not venues by themselves. */
const BARE_METRO_LOCALITY_RE =
  /^(?:kansas\s+city(?:\s*,?\s*(?:mo|ks))?|overland\s+park(?:\s*,?\s*ks)?|olathe|lenexa|shawnee|leawood|prairie\s+village|independence|lee'?s\s+summit|liberty|north\s+kansas\s+city|gladstone|belton|raytown|merriam|mission|parkville)(?:\s*,?\s*(?:mo|ks))?$/i;

const KC_WATCHLIST_CURATOR_RE =
  /^(?:hookedonkc|jasfoodjourney|explorekc|visit_kc|kccurrent|thepitchkc|kcparent|downtownkc)$/i;

function hay(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => (p ?? '').trim().length > 0).join(' · ');
}

function placeCore(c: CalendarAdmissionCandidate): string {
  return hay([c.venue, c.formattedAddress, c.locationName, c.neighborhood, c.city, c.state, c.businessName]);
}

export type GeographicGateResult = {
  ok: boolean;
  quarantine: boolean;
  reason: CalendarAdmissionReasonCode | null;
  detail: string;
  geoEvidence: string[];
  factSupported: boolean;
};

/**
 * Affirmative KC service-area evidence required for accept.
 * Confirmed out-of-market → reject. Unknown / bare city → quarantine.
 * Search context, model assumption, and bare venue names alone do not admit.
 */
export function evaluateGeographicGate(c: CalendarAdmissionCandidate): GeographicGateResult {
  const core = placeCore(c);
  const title = (c.title ?? '').trim();
  const evidence: string[] = [];
  const venue = (c.venue ?? '').trim();
  const placeBlob = hay([core, venue, title]);

  if (KNOWN_OOM_VENUE_RE.test(placeBlob)) {
    evidence.push(`known_oom_venue:${placeBlob.slice(0, 120)}`);
    return {
      ok: false,
      quarantine: false,
      reason: 'outside_service_area',
      detail: 'known_out_of_market_venue',
      geoEvidence: evidence,
      factSupported: true,
    };
  }

  // Truncated "American Airlines" for Fall-Off Tour / Ticketmaster away dates.
  // Wins over hallucinated KC street addresses on the same record.
  if (
    /\bamerican\s+airlines\b/i.test(placeBlob) &&
    /\b(?:fall-?off|j\.?\s*cole|tour)\b/i.test(title)
  ) {
    evidence.push('american_airlines_tour_oom');
    return {
      ok: false,
      quarantine: false,
      reason: 'outside_service_area',
      detail: 'american_airlines_center_tour',
      geoEvidence: evidence,
      factSupported: true,
    };
  }

  if (INTERNATIONAL_PLACE_RE.test(core) && !isKcMetroLocation(core)) {
    evidence.push(`international_place:${core.slice(0, 120)}`);
    return {
      ok: false,
      quarantine: false,
      reason: 'outside_service_area',
      detail: 'international_place',
      geoEvidence: evidence,
      factSupported: true,
    };
  }

  // Structured place fields are authoritative over title brand tokens.
  if (core && isOutOfMarketLocation(core)) {
    evidence.push(`oom_place:${core.slice(0, 120)}`);
    return {
      ok: false,
      quarantine: false,
      reason: 'outside_service_area',
      detail: 'confirmed_out_of_market_place',
      geoEvidence: evidence,
      factSupported: true,
    };
  }

  if (isOutOfMarketLocation(title) && !isKcMetroLocation(title) && !isKcMetroLocation(core)) {
    evidence.push(`oom_title:${title.slice(0, 120)}`);
    return {
      ok: false,
      quarantine: false,
      reason: 'outside_service_area',
      detail: 'confirmed_out_of_market_title',
      geoEvidence: evidence,
      factSupported: true,
    };
  }

  const address = (c.formattedAddress ?? '').trim();
  const loc = (c.locationName ?? '').trim();
  const neighborhood = (c.neighborhood ?? '').trim();
  const cityState = hay([c.city, c.state]);

  if (venue && ESTABLISHED_KC_VENUE_RE.test(venue)) {
    evidence.push(`established_venue:${venue}`);
  }
  if (address && isKcMetroLocation(address) && address.length >= 10) {
    evidence.push(`address_kc:${address.slice(0, 120)}`);
  }
  // Venue + metro locality (not bare city placeholder / not locality-as-venue).
  if (
    venue.length >= 3 &&
    !BARE_METRO_LOCALITY_RE.test(venue) &&
    isKcMetroLocation(hay([loc, neighborhood, cityState, address]))
  ) {
    evidence.push(`venue_with_metro:${venue}`);
  }
  if (
    venue.length >= 3 &&
    isKcMetroLocation(venue) &&
    !BARE_METRO_LOCALITY_RE.test(venue) &&
    ESTABLISHED_KC_VENUE_RE.test(venue)
  ) {
    evidence.push(`venue_name_metro:${venue}`);
  }
  // Specific metro suburb/neighborhood counts as city-level place evidence.
  if (
    neighborhood &&
    isKcMetroLocation(neighborhood) &&
    !BARE_CITY_ONLY_RE.test(neighborhood) &&
    !/^kansas\s+city$/i.test(neighborhood.trim())
  ) {
    evidence.push(`neighborhood_kc:${neighborhood}`);
  }
  if (
    loc &&
    isKcMetroLocation(loc) &&
    !BARE_CITY_ONLY_RE.test(loc) &&
    !/^kansas\s+city$/i.test(loc.trim()) &&
    !BARE_METRO_LOCALITY_RE.test(loc) &&
    venue.length >= 3 &&
    !BARE_METRO_LOCALITY_RE.test(venue)
  ) {
    evidence.push(`location_with_venue:${loc}`);
  }
  // Metro locality alone in locationName (Overland Park, not bare kansas city) is affirmative.
  if (
    evidence.length === 0 &&
    loc &&
    isKcMetroLocation(loc) &&
    !BARE_CITY_ONLY_RE.test(loc) &&
    !/^kansas\s+city$/i.test(loc.trim()) &&
    BARE_METRO_LOCALITY_RE.test(loc)
  ) {
    evidence.push(`metro_locality:${loc}`);
  }

  // VERIFIED Instagram Watchlist leads from known KC curators may lack structured venue
  // at promote time; curator locality is affirmative (not search-context assumption).
  const handle = (c.attribution ?? '').replace(/^@/, '').trim();
  if (
    evidence.length === 0 &&
    c.watchlistVerified === true &&
    KC_WATCHLIST_CURATOR_RE.test(handle) &&
    !isOutOfMarketLocation(core) &&
    !isOutOfMarketLocation(title)
  ) {
    evidence.push(`kc_watchlist_curator:@${handle}`);
  }

  if (evidence.length > 0) {
    return {
      ok: true,
      quarantine: false,
      reason: null,
      detail: 'kc_service_area_affirmed',
      geoEvidence: evidence,
      factSupported: true,
    };
  }

  // Bare city / city+state without venue or street address → quarantine.
  const barePlace = [loc, neighborhood, cityState, core].find(
    (p) => p && (BARE_CITY_ONLY_RE.test(p.trim()) || /^kansas\s+city\b/i.test(p.trim())),
  );
  if (barePlace || (isKcMetroLocation(core) && venue.length < 3 && address.length < 10)) {
    return {
      ok: false,
      quarantine: true,
      reason: 'location_unverified',
      detail: 'bare_city_or_unverified_venue',
      geoEvidence: [`unverified_place:${(barePlace || core || 'empty').slice(0, 80)}`],
      factSupported: false,
    };
  }

  if (!core.trim()) {
    return {
      ok: false,
      quarantine: true,
      reason: 'location_unverified',
      detail: 'missing_place_fields',
      geoEvidence: [],
      factSupported: false,
    };
  }

  // Non-empty place that is neither OOM nor affirmed KC → quarantine, never accept on assumption.
  return {
    ok: false,
    quarantine: true,
    reason: 'location_unverified',
    detail: 'no_affirmative_kc_evidence',
    geoEvidence: [`ambiguous_place:${core.slice(0, 120)}`],
    factSupported: false,
  };
}
