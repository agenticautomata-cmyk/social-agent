import { env } from '../env.js';

export type CreatorLocalScope = {
  configured: boolean;
  label: string | null;
  /** Geography phrase for web search queries — not timezone. */
  searchGeography: string | null;
};

/**
 * Creator operating geography for local relevance research.
 * Separate from timezone (used only for time-of-day calculations).
 */
export function getCreatorLocalScope(): CreatorLocalScope {
  const raw = env.CREATOR_LOCAL_SCOPE?.trim();
  if (!raw) {
    return { configured: false, label: null, searchGeography: null };
  }
  return {
    configured: true,
    label: raw,
    searchGeography: raw,
  };
}

export function buildLocalInventorySearchQuery(input: {
  retailerName: string | null;
  brandName: string | null;
}): string | null {
  const scope = getCreatorLocalScope();
  if (!scope.searchGeography) return null;

  const retailer = input.retailerName ?? 'retailer';
  const brand = input.brandName ?? 'brand';
  return `${retailer} ${brand} store locator inventory ${scope.searchGeography}. Do not assume inventory without evidence. Cite official pages.`;
}

export function localRelevanceUnresolvedNote(): string {
  return 'Local relevance unresolved — creator local scope is not configured; researching national relevance only.';
}

export function localRelevanceLabel(): string | null {
  return getCreatorLocalScope().label;
}
