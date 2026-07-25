import type { LocationSearchContext, ScoredLocationCandidate } from './types.js';
import { KC_METRO_CENTER } from './types.js';

/**
 * Centralized location decision thresholds.
 *
 * resolved:
 *   - Strong address-backed match (composite >= resolvedMin), OR
 *   - Exact/near-exact single candidate: one KC-metro place whose normalized
 *     name clears singleExactNameFloor with no contradictory evidence
 *
 * needs_review:
 *   - Two or more KC-metro candidates whose names strongly match the requested
 *     entity (chainNameFloor) and opportunity lacks street/ZIP/neighborhood/
 *     website context to pick one safely
 *
 * unresolved:
 *   - Best name similarity below nameMatchFloor, or no KC-metro name match,
 *     or only weak city/category-adjacent Google results
 */
export const LOCATION_SCORE_THRESHOLDS = {
  /** Composite score for address-backed auto-resolve. */
  resolvedMin: 0.75,
  /** Minimum normalized name similarity to treat a candidate as name-credible. */
  nameMatchFloor: 0.72,
  /** Near-exact name floor for single-candidate auto-resolve. */
  singleExactNameFloor: 0.85,
  /** Name similarity for chain / multi-location strong matches. */
  chainNameFloor: 0.78,
  /** Max distance (km) from KC metro center for "in metro" decisions. */
  metroMaxKm: 55,
  /** Max distance (km) for full proximity bonus in scoring. */
  distanceFullBonusKm: 35,
  /** Minimum composite score retained for diagnostics (not used for status alone). */
  credibleMin: 0.3,
};

/** Harmless venue-type suffixes only — do not strip brand words like "club". */
export const VENUE_SUFFIXES = [
  'theatre',
  'theater',
  'center',
  'centre',
  'plaza',
  'hall',
  'arena',
  'museum',
  'station',
  'market',
  'district',
  'park',
  'pavilion',
  'complex',
  'building',
  'tower',
] as const;

export type RawLocationCandidate = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
  websiteUrl?: string | null;
};

export type LocationDecision = {
  status: 'resolved' | 'needs_review' | 'unresolved';
  selected: ScoredLocationCandidate | null;
  confidence: number | null;
  reason: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TRAILING_GEO_PHRASES = [
  'kansas city missouri',
  'kansas city mo',
  'kansas city ks',
  'kansas city',
  'overland park',
  'missouri',
  'kansas',
  'usa',
  'us',
  'mo',
  'ks',
] as const;

/** Strip leading "the", trailing geo labels, and common venue suffixes. */
export function normalizeVenueName(value: string | null | undefined): string {
  let text = normalizeText(value);
  if (!text) return '';
  text = text.replace(/^the\s+/, '');

  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of TRAILING_GEO_PHRASES) {
      if (text === phrase) {
        text = '';
        changed = true;
        break;
      }
      if (text.endsWith(` ${phrase}`)) {
        text = text.slice(0, -(phrase.length + 1)).trim();
        changed = true;
      }
    }
    for (const suffix of VENUE_SUFFIXES) {
      const pattern = new RegExp(`\\s+${suffix}$`);
      if (pattern.test(text)) {
        text = text.replace(pattern, '').trim();
        changed = true;
      }
    }
  }
  return text;
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeText(value).split(' ').filter((t) => t.length > 1));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Normalized name similarity in [0, 1] with exact and suffix-aware bonuses. */
export function nameSimilarity(requested: string | null | undefined, candidate: string | null | undefined): number {
  const rawA = normalizeText(requested);
  const rawB = normalizeText(candidate);
  if (!rawA || !rawB) return 0;

  if (rawA === rawB) return 1;

  const coreA = normalizeVenueName(requested);
  const coreB = normalizeVenueName(candidate);
  if (coreA && coreB && coreA === coreB) return 0.97;

  if (coreA && coreB) {
    if (coreB.startsWith(coreA) || coreA.startsWith(coreB)) {
      const shorter = Math.min(coreA.length, coreB.length);
      const longer = Math.max(coreA.length, coreB.length);
      // Require substantial overlap — avoid "cafe" matching "zorbax nonexistent cafe kc"
      if (shorter / longer >= 0.55) return 0.93;
    }
  }

  const jaccard = Math.max(
    jaccardSimilarity(rawA, rawB),
    jaccardSimilarity(coreA, coreB),
  );

  // Prefer requested name contained in candidate label (venue expansion), not the reverse
  if (coreA && coreB && coreB.includes(coreA)) {
    const ratio = coreA.length / coreB.length;
    if (ratio >= 0.45) return Math.max(jaccard, 0.9);
  }
  if (coreA && coreB && coreA.includes(coreB)) {
    const ratio = coreB.length / coreA.length;
    if (ratio >= 0.7) return Math.max(jaccard, 0.9);
  }

  return jaccard;
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function distanceFromKcMetroKm(latitude: number, longitude: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(latitude - KC_METRO_CENTER.latitude);
  const dLon = toRad(longitude - KC_METRO_CENTER.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(KC_METRO_CENTER.latitude)) *
      Math.cos(toRad(latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInKcMetro(latitude: number, longitude: number): boolean {
  return distanceFromKcMetroKm(latitude, longitude) <= LOCATION_SCORE_THRESHOLDS.metroMaxKm;
}

function parseAddressParts(address: string | null | undefined): {
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const text = address ?? '';
  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  const stateMatch = text.match(/\b([A-Z]{2})\b/);
  let parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(usa|us)$/i.test(parts[parts.length - 1]!)) {
    parts = parts.slice(0, -1);
  }
  // Standard US: "street, City, ST ZIP" → city is second-to-last segment
  const city =
    parts.length >= 2 ? parts[parts.length - 2]?.trim().toLowerCase() || null : null;
  return {
    city,
    state: stateMatch?.[1]?.toLowerCase() ?? null,
    zip: zipMatch?.[1] ?? null,
  };
}

export function requestedEntityNames(context: LocationSearchContext): string[] {
  return [context.eventVenue, context.venueName, context.businessName]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
}

export function bestNameSimilarity(context: LocationSearchContext, candidateName: string): number {
  const names = requestedEntityNames(context);
  if (names.length === 0) return 0;
  return Math.max(...names.map((name) => nameSimilarity(name, candidateName)));
}

function hasDisambiguatingContext(context: LocationSearchContext): boolean {
  return Boolean(
    context.address?.trim() ||
      context.zip?.trim() ||
      context.neighborhood?.trim() ||
      context.sourceUrl?.trim() ||
      (context.eventVenue && context.organizerAddress),
  );
}

function hasContradictoryEvidence(
  candidate: RawLocationCandidate,
  context: LocationSearchContext,
  nameSim: number,
): boolean {
  const contextParts = parseAddressParts(context.address);
  const candidateParts = parseAddressParts(candidate.formattedAddress);

  if (context.zip && candidateParts.zip && context.zip !== candidateParts.zip) {
    return true;
  }

  const expectedCity = normalizeText(context.city ?? contextParts.city);
  if (
    expectedCity &&
    candidateParts.city &&
    !candidateParts.city.includes(expectedCity) &&
    !expectedCity.includes(candidateParts.city)
  ) {
    const suburb =
      expectedCity === 'kansas city' &&
      /overland park|lee'?s summit|independence|lenexa|olathe|prairie village|shawnee|north kansas city/.test(
        candidateParts.city,
      );
    if (!suburb) return true;
  }

  if (context.address?.trim()) {
    const normalizedContextAddress = normalizeText(context.address);
    const normalizedCandidateAddress = normalizeText(candidate.formattedAddress);
    const addrSim = jaccardSimilarity(context.address, candidate.formattedAddress);
    const streetHint = normalizedContextAddress.split(' ').slice(0, 3).join(' ');
    const addressAgrees =
      addrSim >= 0.35 ||
      (streetHint.length >= 6 && normalizedCandidateAddress.includes(streetHint));
    if (!addressAgrees && nameSim < LOCATION_SCORE_THRESHOLDS.singleExactNameFloor) {
      return true;
    }
  }

  return false;
}

export function scoreLocationCandidate(
  candidate: RawLocationCandidate,
  context: LocationSearchContext,
): ScoredLocationCandidate {
  const breakdown: Record<string, number> = {
    nameSimilarity: 0,
    exactNameBonus: 0,
    suffixAliasMatch: 0,
    address: 0,
    cityState: 0,
    zip: 0,
    website: 0,
    venuePreference: 0,
    kcDistance: 0,
    contradictionPenalty: 0,
    chainAmbiguity: 0,
  };

  const nameSim = bestNameSimilarity(context, candidate.displayName);
  breakdown.nameSimilarity = Number((nameSim * 0.45).toFixed(3));

  const rawRequested = normalizeText(
    context.eventVenue ?? context.venueName ?? context.businessName,
  );
  const rawCandidate = normalizeText(candidate.displayName);
  if (rawRequested && rawCandidate && rawRequested === rawCandidate) {
    breakdown.exactNameBonus = 0.2;
  } else if (
    normalizeVenueName(context.eventVenue ?? context.venueName ?? context.businessName) &&
    normalizeVenueName(context.eventVenue ?? context.venueName ?? context.businessName) ===
      normalizeVenueName(candidate.displayName)
  ) {
    breakdown.suffixAliasMatch = 0.18;
  } else if (nameSim >= 0.9) {
    breakdown.suffixAliasMatch = 0.12;
  }

  const contextAddress = normalizeText(context.address);
  const candidateAddress = normalizeText(candidate.formattedAddress);
  if (contextAddress && candidateAddress.includes(contextAddress)) {
    breakdown.address = 0.35;
  } else if (contextAddress && jaccardSimilarity(contextAddress, candidateAddress) >= 0.55) {
    breakdown.address = 0.22;
  }

  const contextParts = parseAddressParts(context.address ?? context.organizerAddress);
  const candidateParts = parseAddressParts(candidate.formattedAddress);
  const city = normalizeText(context.city ?? contextParts.city);
  const state = normalizeText(context.state ?? contextParts.state ?? 'mo');
  if (city && candidateParts.city && candidateParts.city.includes(city)) {
    breakdown.cityState = (breakdown.cityState ?? 0) + 0.08;
  }
  if (state && candidateParts.state === state) {
    breakdown.cityState = (breakdown.cityState ?? 0) + 0.07;
  }

  const zip = context.zip ?? contextParts.zip;
  if (zip && candidateParts.zip === zip) breakdown.zip = 0.1;

  const sourceDomain = extractDomain(context.sourceUrl);
  const candidateDomain = extractDomain(candidate.websiteUrl);
  if (sourceDomain && candidateDomain && sourceDomain === candidateDomain) {
    breakdown.website = 0.15;
  }

  if (context.eventVenue && context.organizerAddress) {
    const venueSim = nameSimilarity(context.eventVenue, candidate.displayName);
    const organizerSim = jaccardSimilarity(context.organizerAddress, candidate.formattedAddress);
    if (venueSim > organizerSim + 0.15) breakdown.venuePreference = 0.12;
  }

  const distanceKm = distanceFromKcMetroKm(candidate.latitude, candidate.longitude);
  if (distanceKm <= LOCATION_SCORE_THRESHOLDS.distanceFullBonusKm) {
    breakdown.kcDistance = Number(
      (0.1 * (1 - distanceKm / LOCATION_SCORE_THRESHOLDS.distanceFullBonusKm)).toFixed(3),
    );
  } else if (distanceKm <= LOCATION_SCORE_THRESHOLDS.metroMaxKm) {
    breakdown.kcDistance = 0.04;
  }

  if (hasContradictoryEvidence(candidate, context, nameSim)) {
    breakdown.contradictionPenalty = -0.25;
  }

  // Diagnostic flag only — decision logic applies the real multi-location rule
  breakdown.chainAmbiguity = 0;

  const score = Math.max(
    0,
    Math.min(1, Object.values(breakdown).reduce((sum, value) => sum + (value ?? 0), 0)),
  );

  return {
    ...candidate,
    score: Number(score.toFixed(3)),
    scoreBreakdown: {
      ...breakdown,
      _nameSimilarityRaw: nameSim,
      _distanceKm: Number(distanceKm.toFixed(2)),
      _inKcMetro: isInKcMetro(candidate.latitude, candidate.longitude) ? 1 : 0,
    },
  };
}

function nameSimFromBreakdown(candidate: ScoredLocationCandidate): number {
  const raw = candidate.scoreBreakdown._nameSimilarityRaw;
  if (typeof raw === 'number') return raw;
  return candidate.scoreBreakdown.nameSimilarity ?? 0;
}

/**
 * Decide resolved / needs_review / unresolved from scored candidates + search context.
 */
export function decideLocationResolution(
  candidates: ScoredLocationCandidate[],
  context: LocationSearchContext = {},
): LocationDecision {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) {
    return { status: 'unresolved', selected: null, confidence: null, reason: 'no_candidates' };
  }

  const nameMatches = ranked.filter((candidate) => {
    const nameSim = nameSimFromBreakdown(candidate);
    return (
      nameSim >= LOCATION_SCORE_THRESHOLDS.nameMatchFloor &&
      isInKcMetro(candidate.latitude, candidate.longitude) &&
      !hasContradictoryEvidence(candidate, context, nameSim)
    );
  });

  const strongNameMatches = ranked.filter((candidate) => {
    const nameSim = nameSimFromBreakdown(candidate);
    return (
      nameSim >= LOCATION_SCORE_THRESHOLDS.chainNameFloor &&
      isInKcMetro(candidate.latitude, candidate.longitude) &&
      !hasContradictoryEvidence(candidate, context, nameSim)
    );
  });

  // Address-backed strong resolve (Union Station with street)
  if (
    top.score >= LOCATION_SCORE_THRESHOLDS.resolvedMin &&
    nameSimFromBreakdown(top) >= LOCATION_SCORE_THRESHOLDS.nameMatchFloor &&
    isInKcMetro(top.latitude, top.longitude) &&
    !hasContradictoryEvidence(top, context, nameSimFromBreakdown(top))
  ) {
    // If multiple strong name matches and no address context, prefer review
    if (strongNameMatches.length > 1 && !hasDisambiguatingContext(context)) {
      return {
        status: 'needs_review',
        selected: null,
        confidence: top.score,
        reason: 'multiple_metro_name_matches',
      };
    }
    // With address/zip context, pick the best-scoring branch
    if (strongNameMatches.length > 1 && hasDisambiguatingContext(context)) {
      return {
        status: 'resolved',
        selected: top,
        confidence: top.score,
        reason: 'address_disambiguated_chain',
      };
    }
    return {
      status: 'resolved',
      selected: top,
      confidence: top.score,
      reason: 'strong_composite_match',
    };
  }

  // Multiple legitimate chain / multi-location matches → needs_review
  if (strongNameMatches.length > 1) {
    if (hasDisambiguatingContext(context)) {
      // Enough context: resolve to best if it clearly wins on address/zip
      const second = strongNameMatches[1];
      if (second && top.score - second.score >= 0.12 && breakdownHasAddressSignal(top)) {
        return {
          status: 'resolved',
          selected: top,
          confidence: top.score,
          reason: 'address_overrides_chain_ambiguity',
        };
      }
    }
    for (const candidate of strongNameMatches) {
      candidate.scoreBreakdown.chainAmbiguity = 0.1;
    }
    return {
      status: 'needs_review',
      selected: null,
      confidence: top.score,
      reason: 'multiple_metro_name_matches',
    };
  }

  // Exact / near-exact single candidate in KC metro
  if (
    nameMatches.length === 1 &&
    nameSimFromBreakdown(nameMatches[0]!) >= LOCATION_SCORE_THRESHOLDS.singleExactNameFloor &&
    isInKcMetro(nameMatches[0]!.latitude, nameMatches[0]!.longitude)
  ) {
    const selected = nameMatches[0]!;
    return {
      status: 'resolved',
      selected,
      confidence: Math.max(selected.score, nameSimFromBreakdown(selected)),
      reason: 'single_near_exact_name_match',
    };
  }

  // Single strong name match that is in metro but slightly below exact floor —
  // still resolve when name similarity is high enough and no contradiction
  if (
    nameMatches.length === 1 &&
    nameSimFromBreakdown(nameMatches[0]!) >= LOCATION_SCORE_THRESHOLDS.chainNameFloor
  ) {
    const selected = nameMatches[0]!;
    return {
      status: 'resolved',
      selected,
      confidence: Math.max(selected.score, nameSimFromBreakdown(selected)),
      reason: 'single_strong_name_match',
    };
  }

  // Weak / unrelated — do not escalate to needs_review just because Google returned many rows
  return {
    status: 'unresolved',
    selected: null,
    confidence: top.score,
    reason:
      nameMatches.length === 0
        ? 'no_credible_name_match'
        : 'insufficient_evidence',
  };
}

function breakdownHasAddressSignal(candidate: ScoredLocationCandidate): boolean {
  return (candidate.scoreBreakdown.address ?? 0) > 0 || (candidate.scoreBreakdown.zip ?? 0) > 0;
}

export function buildLocationSearchQuery(context: LocationSearchContext): string {
  const parts = [
    context.eventVenue,
    context.venueName,
    context.businessName,
    context.address,
    context.neighborhood,
    context.city ?? 'Kansas City',
    context.state ?? 'MO',
  ].filter(Boolean);
  return parts.join(', ');
}
