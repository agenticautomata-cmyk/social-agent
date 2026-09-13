/**
 * Canonical KC venue resolver — affirmative geo evidence only for registry hits.
 */
import { CANONICAL_KC_VENUES, type CanonicalVenueRecord } from './registry.js';

export type VenueResolveInput = {
  venue?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  neighborhood?: string | null;
  businessName?: string | null;
  city?: string | null;
  state?: string | null;
  title?: string | null;
};

export type VenueResolveResult = {
  matched: boolean;
  venue: CanonicalVenueRecord | null;
  evidenceTag: string | null;
  matchedOn: string | null;
};

function normalizeVenueText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function haystack(input: VenueResolveInput): string {
  return [
    input.venue,
    input.locationName,
    input.formattedAddress,
    input.neighborhood,
    input.businessName,
    input.city,
    input.state,
    input.title,
  ]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .join(' · ');
}

type IndexedAlias = { venue: CanonicalVenueRecord; aliasNorm: string; aliasLen: number };

const ALIAS_INDEX: IndexedAlias[] = CANONICAL_KC_VENUES.flatMap((venue) => {
  const names = [venue.name, ...venue.aliases];
  return names.map((alias) => ({
    venue,
    aliasNorm: normalizeVenueText(alias),
    aliasLen: normalizeVenueText(alias).length,
  }));
}).sort((a, b) => b.aliasLen - a.aliasLen);

/**
 * Resolve free-text place fields against the canonical KC venue registry.
 * Longest alias wins to avoid short ambiguous tokens.
 */
export function resolveCanonicalVenue(input: VenueResolveInput): VenueResolveResult {
  const blob = normalizeVenueText(haystack(input));
  if (!blob) {
    return { matched: false, venue: null, evidenceTag: null, matchedOn: null };
  }

  for (const entry of ALIAS_INDEX) {
    if (entry.aliasLen < 4) continue;
    const re = new RegExp(`(?:^|\\s)${entry.aliasNorm.replace(/\s+/g, '\\s+')}(?:\\s|$)`);
    if (re.test(blob) || blob.includes(entry.aliasNorm)) {
      if (!entry.venue.serviceArea) continue;
      return {
        matched: true,
        venue: entry.venue,
        evidenceTag: `canonical_venue:${entry.venue.id}`,
        matchedOn: entry.aliasNorm,
      };
    }
  }

  return { matched: false, venue: null, evidenceTag: null, matchedOn: null };
}

export function getCanonicalVenueById(id: string): CanonicalVenueRecord | null {
  return CANONICAL_KC_VENUES.find((v) => v.id === id) ?? null;
}

export function listCanonicalVenueIds(): string[] {
  return CANONICAL_KC_VENUES.map((v) => v.id);
}
