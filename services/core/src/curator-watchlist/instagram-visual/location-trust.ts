/**
 * Location trust — curator handle is never sole geo evidence.
 */

const KC_MARKET =
  /\b(?:kansas\s*city|kcmo|kck|overland\s*park|lawrence|olathe|independence(?:\s+mo)?|lee'?s\s*summit|shawnee|lenexa|mission(?:\s+hills)?|prairie\s*village|north\s*kansas\s*city|westport|crossroads|power\s*&?\s*light|plaza|midtown|downtown\s*kc|18th\s*&?\s*vine)\b/i;

const OUT_OF_MARKET =
  /\b(?:los\s*angeles|new\s*york|chicago|miami|atlanta|houston|dallas|austin|denver|seattle|portland|phoenix|nashville|las\s*vegas|san\s*francisco|brooklyn|manhattan)\b/i;

export type LocationTrustResult = {
  trust: 'evidenced' | 'curator_only' | 'unknown' | 'out_of_market';
  venue: string | null;
  city: string | null;
  address: string | null;
  neighborhood: string | null;
  evidenceNotes: string[];
};

export function assessLocationTrust(input: {
  flyerText?: string | null;
  caption?: string | null;
  locationTag?: string | null;
  venueFromOcr?: string | null;
  addressFromOcr?: string | null;
  curatorHandle?: string | null;
  venueRegistryHit?: boolean;
}): LocationTrustResult {
  const notes: string[] = [];
  const blob = [input.flyerText, input.caption, input.locationTag, input.venueFromOcr, input.addressFromOcr]
    .filter(Boolean)
    .join('\n');

  const venue =
    input.venueFromOcr?.trim() ||
    blob.match(
      /\b(?:at|@)\s+([A-Z][\w'&.\s]{2,40}?)(?:\s*[|•\n]|$)/,
    )?.[1]?.trim() ||
    null;

  const address =
    input.addressFromOcr?.trim() ||
    blob.match(/\b\d{2,5}\s+[A-Za-z0-9.'\s]{3,40}(?:St|Street|Ave|Avenue|Blvd|Rd|Road|Dr|Drive)\b/i)?.[0] ||
    null;

  let city: string | null = null;
  if (KC_MARKET.test(blob) || KC_MARKET.test(input.locationTag ?? '')) {
    city = 'Kansas City';
    notes.push('kc_market_text');
  }

  if (OUT_OF_MARKET.test(blob) && !KC_MARKET.test(blob)) {
    notes.push('out_of_market_text');
    return {
      trust: 'out_of_market',
      venue,
      city: null,
      address,
      neighborhood: null,
      evidenceNotes: notes,
    };
  }

  if (input.locationTag?.trim()) {
    notes.push('platform_location_tag');
  }
  if (input.venueRegistryHit) {
    notes.push('venue_registry');
  }
  if (venue) notes.push('venue_from_flyer_or_caption');
  if (address) notes.push('address_from_flyer');

  const evidenced =
    Boolean(input.locationTag?.trim()) ||
    Boolean(venue) ||
    Boolean(address) ||
    Boolean(input.venueRegistryHit) ||
    Boolean(city);

  if (evidenced) {
    return {
      trust: 'evidenced',
      venue,
      city,
      address,
      neighborhood: null,
      evidenceNotes: notes,
    };
  }

  if (input.curatorHandle) {
    notes.push('curator_handle_not_sole_geo');
    return {
      trust: 'curator_only',
      venue: null,
      city: null,
      address: null,
      neighborhood: null,
      evidenceNotes: notes,
    };
  }

  return {
    trust: 'unknown',
    venue: null,
    city: null,
    address: null,
    neighborhood: null,
    evidenceNotes: notes,
  };
}
