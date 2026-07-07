import type { InventoryItem } from '../inventory/normalize.js';
import { computeSponsorIntelligence, type SponsorRecommendation } from './recommendations.js';

export type TopSponsorCandidatesResponse = {
  demoMode: boolean;
  generatedAt: string;
  limit: number;
  totalEligible: number;
  items: SponsorRecommendation[];
};

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

  const byId = new Map<string, SponsorRecommendation>();
  for (const section of intel.sections) {
    for (const rec of section.items) {
      const prev = byId.get(rec.contentItemId);
      if (!prev || rec.scores.contactFirst > prev.scores.contactFirst) {
        byId.set(rec.contentItemId, rec);
      }
    }
  }

  const ranked = [...byId.values()]
    .sort((a, b) => b.scores.contactFirst - a.scores.contactFirst)
    .slice(0, limit);

  return {
    demoMode: intel.demoMode,
    generatedAt: intel.generatedAt,
    limit,
    totalEligible: intel.counts.totalEligible,
    items: ranked,
  };
}
