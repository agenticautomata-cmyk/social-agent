import { getCreatorLocalScope } from './creator-local-scope.js';
import type { LocalAvailabilityStatus, PartnershipLocalLocation } from './types.js';

/** Metro place-name markers used when matching research claims to a configured local scope. */
const LOCAL_PLACE_MARKERS =
  /\b(kansas city|kansas city,?\s*(?:mo|ks)|kc metro|overland park|olathe|leawood|prairie village|independence|blue springs|lenexa|shawnee|parkville|liberty|northland|crossroads|plaza|country club plaza)\b/i;

export function classifyLocalAvailability(input: {
  claim: string;
  source: string | null;
  hasExplicitKcInventory?: boolean;
  isNationalRetailerOnly?: boolean;
}): LocalAvailabilityStatus {
  const claim = input.claim.toLowerCase();
  const scope = getCreatorLocalScope();
  const mentionsConfiguredScope =
    (scope.searchGeography && claim.includes(scope.searchGeography.toLowerCase())) ||
    LOCAL_PLACE_MARKERS.test(claim);

  if (/\b(do not currently|not currently offer|not available at|online only|website only|not in store)\b/.test(claim)) {
    return 'unknown_call_first';
  }
  if (
    /\b(confirmed|in stock|available at|carries|inventory at|visit our)\b/.test(claim) &&
    mentionsConfiguredScope
  ) {
    return 'confirmed_available';
  }
  if (input.hasExplicitKcInventory && mentionsConfiguredScope) {
    return 'confirmed_available';
  }
  if (input.isNationalRetailerOnly && !mentionsConfiguredScope) {
    return 'unknown_call_first';
  }
  if (
    /\b(likely|may carry|nationwide|select stores|check local|store locator)\b/.test(claim) &&
    mentionsConfiguredScope
  ) {
    return 'likely_available';
  }
  if (mentionsConfiguredScope) {
    return 'likely_available';
  }
  return 'unknown_call_first';
}

export function buildLocalLocationRows(input: {
  researchText: string;
  retailerName: string | null;
  citations: Array<{ url: string; title: string | null }>;
}): PartnershipLocalLocation[] {
  const locations: PartnershipLocalLocation[] = [];
  const retailer = input.retailerName ?? 'Retailer';
  const scope = getCreatorLocalScope();
  const areaLabel = scope.label ?? 'local area (scope unconfigured)';

  const localMentions = input.researchText
    .split(/\n+/)
    .filter((line) => {
      if (scope.searchGeography && line.toLowerCase().includes(scope.searchGeography.toLowerCase())) {
        return true;
      }
      return LOCAL_PLACE_MARKERS.test(line);
    })
    .slice(0, 6);

  for (const line of localMentions) {
    const availability = classifyLocalAvailability({
      claim: line,
      source: 'web_research',
      isNationalRetailerOnly: /\bnationwide|all stores|online only\b/i.test(line),
    });
    locations.push({
      name: `${retailer} — ${areaLabel}`,
      address: extractAddress(line),
      availability,
      notes: line.trim().slice(0, 240),
      source: input.citations[0]?.url ?? null,
    });
  }

  if (locations.length === 0 && input.retailerName) {
    if (!scope.configured) {
      locations.push({
        name: `${input.retailerName} — national / local unresolved`,
        address: null,
        availability: 'unknown_call_first',
        notes:
          'Creator local scope is not configured. Research national relevance only; verify any local store inventory before filming.',
        source: input.citations[0]?.url ?? null,
      });
    } else {
      locations.push({
        name: `${input.retailerName} — ${areaLabel}`,
        address: null,
        availability: 'unknown_call_first',
        notes: `National retailer may carry this brand online or in select stores. Verify inventory within ${areaLabel} via store locator or phone before filming.`,
        source: input.citations[0]?.url ?? null,
      });
    }
  }

  return locations;
}

function extractAddress(line: string): string | null {
  const match = line.match(/\b\d{2,5}\s+[A-Za-z0-9\s.,#-]{8,60}(?:MO|KS|Missouri|Kansas)\b/i);
  return match?.[0]?.trim() ?? null;
}

export function localAvailabilityLabel(status: LocalAvailabilityStatus): string {
  switch (status) {
    case 'confirmed_available':
      return 'CONFIRMED AVAILABLE';
    case 'confirmed_unavailable':
      return 'CONFIRMED UNAVAILABLE (this location)';
    case 'likely_available':
      return 'LIKELY AVAILABLE';
    default:
      return 'UNKNOWN / CALL FIRST';
  }
}
