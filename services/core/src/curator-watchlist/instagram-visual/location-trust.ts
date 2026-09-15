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

  const venueLines = blob
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        /\b(?:bridge|theater|theatre|hall|arena|stadium|pavilion|amphitheatre|amphitheater|club|lounge|gallery|museum|park|center|centre|ballroom|brewery|winery|farm|market|church|temple|plaza)\b/i.test(
          l,
        ) &&
        l.length >= 4 &&
        l.length <= 80 &&
        !/\b(?:friday|saturday|sunday|monday|tuesday|wednesday|thursday|\d{1,2}:\d{2}|am|pm)\b/i.test(l),
    );

  // Prefer concrete venue names (e.g. "Rock Island Bridge") over event titles ("Rock the Bridge")
  const venueFromLine =
    venueLines.find((l) =>
      /\b(?:island|theater|theatre|hall|arena|stadium|pavilion|amphitheatre|amphitheater|club|lounge|gallery|museum|center|centre|ballroom|brewery|winery)\b/i.test(
        l,
      ),
    ) ||
    venueLines.find((l) => !/\bthe\s+bridge\b/i.test(l)) ||
    venueLines[venueLines.length - 1] ||
    null;

  const venueRaw =
    input.venueFromOcr?.trim() ||
    blob.match(
      /\b(?:at|@)\s+([A-Z][\w'&.\s]{2,40}?)(?:\s*[|•\n]|$)/,
    )?.[1]?.trim() ||
    venueFromLine ||
    null;

  // Never persist time-mangled venues like "VYE. 8PM." or "Rooftop 8:00 PM".
  const TIME_ONLY = /\b\d{1,2}(?::\d{2})?\s*[ap]m\b/i;
  const stripTime = (v: string) =>
    v
      .replace(/\b\d{1,2}(?::\d{2})?\s*[ap]m\b/gi, '')
      .replace(/[.|•]+\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  let venue = venueRaw ? stripTime(venueRaw) : null;
  if (venue && (TIME_ONLY.test(venueRaw!) || venue.length < 2 || /^[\d\s:apm.]+$/i.test(venue))) {
    notes.push('venue_rejected_time_fragment');
    venue = venueFromLine && !TIME_ONLY.test(venueFromLine) ? stripTime(venueFromLine) : null;
  }
  // Normalize common lounge/rooftop venue variants without inventing names.
  if (venue) {
    venue = venue.replace(/\brooftop\b/i, (m) => m).replace(/\s+/g, ' ').trim();
  }

  const addressMatch =
    blob.match(
      /\b(\d{2,5}\s+[A-Za-z0-9.'\-]+\s+(?:[A-Za-z0-9.'\-]+\s+){0,4}(?:St|Street|Ave|Avenue|Blvd|Rd|Road|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway))\b(?:\s*[,|]?\s*(?:Kansas\s*City|KCMO|KC)[^,\n]{0,40}(?:\d{5})?)?/i,
    )?.[0] ?? null;

  const address = (input.addressFromOcr?.trim() || addressMatch || null)?.split(/\n/)[0]?.trim() || null;

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
