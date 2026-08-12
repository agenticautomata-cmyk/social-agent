import type { InventoryItem } from '../inventory/normalize.js';
import { computeSponsorIntelligence, type SponsorRecommendation } from './recommendations.js';
import { normalizeBusinessNameKey } from '../sponsor-outreach/canonicalize.js';

export type TopSponsorCandidatesResponse = {
  demoMode: boolean;
  generatedAt: string;
  limit: number;
  totalEligible: number;
  items: SponsorRecommendation[];
};

export function rankedSponsorRecommendationsFromIntel(
  intel: Awaited<ReturnType<typeof computeSponsorIntelligence>>,
): SponsorRecommendation[] {
  const byId = new Map<string, SponsorRecommendation>();
  for (const section of intel.sections) {
    for (const rec of section.items) {
      const prev = byId.get(rec.contentItemId);
      if (!prev || rec.scores.contactFirst > prev.scores.contactFirst) {
        byId.set(rec.contentItemId, rec);
      }
    }
  }
  return dedupeRecommendationsByBusiness([...byId.values()]);
}

/** Build top-N slice from precomputed sponsor intelligence (no second intel pass). */
export function topSponsorCandidatesFromIntel(
  intel: Awaited<ReturnType<typeof computeSponsorIntelligence>>,
  options?: { limit?: number },
): TopSponsorCandidatesResponse {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const ranked = rankedSponsorRecommendationsFromIntel(intel);
  return {
    demoMode: intel.demoMode,
    generatedAt: intel.generatedAt,
    limit,
    totalEligible: intel.counts.totalEligible,
    items: ranked.slice(0, limit),
  };
}

/** Flat ranked list across all eligible inventory (not per-section caps). */
export async function computeTopSponsorCandidates(
  items: InventoryItem[],
  options?: { limit?: number; demoMode?: boolean },
): Promise<TopSponsorCandidatesResponse> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const intel = await computeSponsorIntelligence(items, {
    limit: 50,
    demoMode: options?.demoMode,
  });
  return topSponsorCandidatesFromIntel(intel, { limit });
}

/**
 * Multiple discovered posts/pages can reference the same real-world business (e.g. three
 * separate "Price Chopper weekly deals" content items, or duplicate offer pages). Without
 * collapsing these, the same business could occupy several of the top-N ranked slots and
 * produce duplicate "Finish pitch" action cards for one business — see P10/P9 dedup
 * requirements. Keeps only the highest-scoring content item per normalized business name,
 * then re-sorts descending by score.
 */
export function dedupeRecommendationsByBusiness(
  recommendations: SponsorRecommendation[],
): SponsorRecommendation[] {
  const byBusiness = new Map<string, SponsorRecommendation>();
  for (const rec of recommendations) {
    const key = normalizeBusinessNameKey(rec.businessName) || rec.contentItemId;
    const prev = byBusiness.get(key);
    if (!prev || rec.scores.contactFirst > prev.scores.contactFirst) {
      byBusiness.set(key, rec);
    }
  }
  return [...byBusiness.values()].sort((a, b) => b.scores.contactFirst - a.scores.contactFirst);
}
