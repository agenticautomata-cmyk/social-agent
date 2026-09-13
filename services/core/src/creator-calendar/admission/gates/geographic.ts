import { isKcMetroLocation, isOutOfMarketLocation } from '../../../ask-benson/url-geo.js';
import { resolveCanonicalVenue } from '../venues/resolve.js';
import type { CalendarAdmissionCandidate, CalendarAdmissionReasonCode } from '../types.js';

/** Known out-of-market arenas / halls (even when city omitted or truncated). */
const KNOWN_OOM_VENUE_RE =
  /\b(?:american\s+airlines\s+center|\baac\b|madison\s+square\s+garden|\bmsg\b|red\s+rocks(?:\s+amphitheatre)?|crypto\.com\s+arena|united\s+center|ball\s+arena|chase\s+center|barclays\s+center)\b/i;

const INTERNATIONAL_PLACE_RE =
  /\b(?:amsterdam|berlin|london|paris|dublin|toronto|vancouver|montreal|sydney|melbourne|tokyo|osaka|seoul|mexico\s+city|netherlands|germany|england|uk|france|ireland|canada|australia|japan)\b/i;

const BARE_CITY_ONLY_RE =
  /^(?:kansas\s+city(?:\s*,?\s*(?:mo|kansas|ks))?|kc(?:\s*,?\s*mo)?)$/i;

/** Curator attribution placeholders like "Kansas City (via @hookedonkc)" are not venues. */
const CURATOR_VIA_PLACEHOLDER_RE =
  /^kansas\s+city\s*\(\s*via\s+@[^)]+\)\s*$/i;

/** Metro locality names that are not venues by themselves. */
const BARE_METRO_LOCALITY_RE =
  /^(?:kansas\s+city(?:\s*,?\s*(?:mo|ks))?|overland\s+park(?:\s*,?\s*ks)?|olathe|lenexa|shawnee|leawood|prairie\s+village|independence|lee'?s\s+summit|liberty|north\s+kansas\s+city|gladstone|belton|raytown|merriam|mission|parkville)(?:\s*,?\s*(?:mo|ks))?$/i;

function isBareOrPlaceholderVenue(venue: string): boolean {
  const v = venue.trim();
  if (!v) return true;
  if (BARE_CITY_ONLY_RE.test(v)) return true;
  if (CURATOR_VIA_PLACEHOLDER_RE.test(v)) return true;
  if (BARE_METRO_LOCALITY_RE.test(v)) return true;
  return false;
}

/** Approximate KC-metro radius center (Union Station) in degrees. */
const KC_CENTER = { lat: 39.0847, lng: -94.5855 };
const KC_RADIUS_MILES = 45;

function hay(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => (p ?? '').trim().length > 0).join(' · ');
}

function placeCore(c: CalendarAdmissionCandidate): string {
  return hay([c.venue, c.formattedAddress, c.locationName, c.neighborhood, c.city, c.state, c.businessName]);
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function coordsFromMetadata(c: CalendarAdmissionCandidate): { lat: number; lng: number } | null {
  const meta = c.metadata ?? {};
  const latRaw = meta.lat ?? meta.latitude ?? meta.geoLat;
  const lngRaw = meta.lng ?? meta.longitude ?? meta.geoLng;
  const lat = typeof latRaw === 'number' ? latRaw : typeof latRaw === 'string' ? Number(latRaw) : NaN;
  const lng = typeof lngRaw === 'number' ? lngRaw : typeof lngRaw === 'string' ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
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
 * Curator watchlist handle alone does NOT admit (curator ≠ event locality).
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

  // Canonical venue registry — strongest affirmative evidence.
  const resolved = resolveCanonicalVenue({
    venue: c.venue,
    locationName: c.locationName,
    formattedAddress: c.formattedAddress,
    neighborhood: c.neighborhood,
    businessName: c.businessName,
    city: c.city,
    state: c.state,
    title: c.title,
  });
  if (resolved.matched && resolved.evidenceTag) {
    evidence.push(resolved.evidenceTag);
  }

  // Verified city+state in KC metro (not bare city alone).
  const city = (c.city ?? '').trim();
  const state = (c.state ?? '').trim();
  if (
    city &&
    state &&
    isKcMetroLocation(`${city}, ${state}`) &&
    !BARE_CITY_ONLY_RE.test(`${city}, ${state}`)
  ) {
    // Prefer when paired with a non-bare venue OR complete address.
    if ((venue.length >= 3 && !BARE_METRO_LOCALITY_RE.test(venue)) || address.length >= 10) {
      evidence.push(`verified_city_state:${city},${state}`);
    }
  }

  if (address && isKcMetroLocation(address) && address.length >= 10) {
    evidence.push(`address_kc:${address.slice(0, 120)}`);
  }

  // Coordinates inside KC radius.
  const coords = coordsFromMetadata(c);
  if (coords && haversineMiles(coords, KC_CENTER) <= KC_RADIUS_MILES) {
    evidence.push(`coords_in_radius:${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`);
  }

  // Venue + metro locality (not bare city placeholder / not locality-as-venue).
  if (
    venue.length >= 3 &&
    !isBareOrPlaceholderVenue(venue) &&
    isKcMetroLocation(hay([loc, neighborhood, cityState, address]))
  ) {
    evidence.push(`venue_with_metro:${venue}`);
  }

  // Specific metro suburb/neighborhood counts as affirmative locality evidence
  // (Overland Park / Westport — not bare "kansas city").
  if (
    neighborhood &&
    isKcMetroLocation(neighborhood) &&
    !BARE_CITY_ONLY_RE.test(neighborhood) &&
    !/^kansas\s+city$/i.test(neighborhood.trim())
  ) {
    if (venue.length >= 3 && !BARE_METRO_LOCALITY_RE.test(venue)) {
      evidence.push(`neighborhood_with_venue:${neighborhood}`);
    } else if (BARE_METRO_LOCALITY_RE.test(neighborhood) || !/^kansas\s+city/i.test(neighborhood)) {
      evidence.push(`neighborhood_kc:${neighborhood}`);
    }
  }

  if (
    loc &&
    isKcMetroLocation(loc) &&
    !BARE_CITY_ONLY_RE.test(loc) &&
    !CURATOR_VIA_PLACEHOLDER_RE.test(loc) &&
    !/^kansas\s+city$/i.test(loc.trim()) &&
    !BARE_METRO_LOCALITY_RE.test(loc) &&
    venue.length >= 3 &&
    !isBareOrPlaceholderVenue(venue)
  ) {
    evidence.push(`location_with_venue:${loc}`);
  }

  // Metro locality alone in locationName or neighborhood (Overland Park, not bare kansas city).
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

  // NOTE: kc_watchlist_curator alone is intentionally NOT affirmative evidence.
  // Curator ≠ event locality. Keep a note only when other evidence already exists.
  const handle = (c.attribution ?? '').replace(/^@/, '').trim();
  if (
    evidence.length > 0 &&
    c.watchlistVerified === true &&
    handle &&
    !isOutOfMarketLocation(core) &&
    !isOutOfMarketLocation(title)
  ) {
    evidence.push(`curator_context:@${handle}`);
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

  return {
    ok: false,
    quarantine: true,
    reason: 'location_unverified',
    detail: 'no_affirmative_kc_evidence',
    geoEvidence: [`ambiguous_place:${core.slice(0, 120)}`],
    factSupported: false,
  };
}
