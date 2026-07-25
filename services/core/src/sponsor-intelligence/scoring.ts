import type { InventoryItem } from '../inventory/normalize.js';
import { isShoppingRetailContent } from '../inventory/content-framing.js';
import { isWorldCupSeasonActive } from '../inventory/mega-events.js';
import {
  evaluateAngleForInventory,
  pickTemplateTypeFromAngle,
  recommendedPitchAngleFromMatch,
  suggestedContentAngleFromMatch,
  suggestedSponsorshipAngleFromMatch,
} from '../content-angles/match-angle.js';

export type SponsorScores = {
  sponsorFit: number;
  audienceFit: number;
  revenuePotential: number;
  confidence: number;
};

const OPENING_CATEGORIES = new Set([
  'restaurant_opening',
  'coffee_opening',
  'business_opening',
  'boutique_opening',
  'retail_opening',
  'pop_up_shop',
]);

const HIGH_REVENUE_CATEGORIES = new Set([
  'hotel_package',
  'spa_package',
  'luxury_dining',
  'date_night',
  'luxury_deal',
  'boutique_opening',
  'retail_opening',
  'restaurant_opening',
  'weekend_getaway',
  'rooftop_experience',
  'wine_tasting',
]);

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeConfidenceScore(item: InventoryItem): number {
  let score = 45;
  if (!item.flags.reddit) score += 20;
  else score -= 25;
  if (item.sourceUrl) score += 15;
  if (item.businessName) score += 12;
  if (item.venue || item.address) score += 8;
  if (item.relevanceScore) {
    const parsed = parseFloat(item.relevanceScore);
    if (!Number.isNaN(parsed)) score += Math.round(parsed * 15);
  }
  if (item.ingest && item.ingest !== 'reddit_rss') score += 5;
  return clamp(score);
}

export function computeSponsorFitScore(item: InventoryItem): number {
  let score = 0;
  if (item.flags.sponsorFriendly) score += 35;
  if (item.businessName) score += 25;
  if (item.flags.luxury) score += 15;
  if (item.flags.businessOpening) score += 15;
  if (item.flags.dining) score += 10;
  if (item.flags.estateSale) score += 10;
  if (item.flags.dateNight) score += 8;
  if (item.flags.shopping || item.flags.retail) score += 10;
  if (item.flags.reddit) score -= 20;
  return clamp(score);
}

export function computeAudienceFitScore(
  item: InventoryItem,
  analyticsBoost = 0,
): number {
  let score = item.audienceScore * 10;
  if (analyticsBoost > 0) {
    score += Math.min(20, Math.round((analyticsBoost - 1) * 15));
  }
  if (item.flags.celebrityCharity) score += 5;
  if (item.flags.sports) score += 3;
  return clamp(score);
}

export function computeRevenuePotentialScore(item: InventoryItem): number {
  let score = 20;
  if (item.flags.luxury) score += 25;
  if (item.flags.dateNight) score += 15;
  if (item.flags.dining) score += 15;
  if (item.flags.shopping || item.flags.retail) score += 18;
  if (item.flags.worldCup && isWorldCupSeasonActive()) score += 20;
  if (item.flags.businessOpening) score += 12;
  if (item.category && HIGH_REVENUE_CATEGORIES.has(item.category)) score += 15;
  if (item.businessName) score += 10;
  if (item.flags.freeEvent) score -= 10;
  if (item.flags.reddit) score -= 15;
  return clamp(score);
}

export function computeAllScores(
  item: InventoryItem,
  analyticsBoost = 0,
): SponsorScores {
  return {
    sponsorFit: computeSponsorFitScore(item),
    audienceFit: computeAudienceFitScore(item, analyticsBoost),
    revenuePotential: computeRevenuePotentialScore(item),
    confidence: computeConfidenceScore(item),
  };
}

export function contactFirstComposite(scores: SponsorScores): number {
  return clamp(
    scores.sponsorFit * 0.35 +
      scores.confidence * 0.25 +
      scores.audienceFit * 0.2 +
      scores.revenuePotential * 0.2,
  );
}

export function pickTemplateType(item: InventoryItem): string {
  const match = evaluateAngleForInventory(item);
  return pickTemplateTypeFromAngle(match);
}

export function recommendedPitchAngle(item: InventoryItem): string {
  return recommendedPitchAngleFromMatch(evaluateAngleForInventory(item));
}

export function suggestedContentAngle(item: InventoryItem): string {
  return suggestedContentAngleFromMatch(evaluateAngleForInventory(item));
}

export function suggestedSponsorshipAngle(item: InventoryItem): string {
  return suggestedSponsorshipAngleFromMatch(evaluateAngleForInventory(item));
}

export function evaluateSponsorAngle(item: InventoryItem) {
  return evaluateAngleForInventory(item);
}

export function expectedAudienceFitLabel(score: number): string {
  if (score >= 75) return 'Strong — aligns with Kellie\'s top-performing local lifestyle content.';
  if (score >= 55) return 'Good — solid KC audience interest with clear niche overlap.';
  if (score >= 35) return 'Moderate — worth testing with a lightweight pitch.';
  return 'Low — verify audience overlap before investing outreach time.';
}

export function isSponsorEligible(item: InventoryItem): boolean {
  const hasContactTarget = !!(item.businessName || item.venue);
  const sponsorSignal =
    item.flags.sponsorFriendly ||
    item.flags.businessOpening ||
    item.flags.luxury ||
    (item.flags.dining && !!item.businessName);
  return hasContactTarget && sponsorSignal;
}

export function isHighRevenueEligible(item: InventoryItem): boolean {
  return (
    item.flags.luxury ||
    item.flags.dining ||
    item.flags.shopping ||
    item.flags.retail ||
    item.flags.dateNight ||
    (item.flags.worldCup && isWorldCupSeasonActive()) ||
    (item.category != null && HIGH_REVENUE_CATEGORIES.has(item.category))
  );
}

export function isFastWinEligible(item: InventoryItem): boolean {
  return (
    !!item.businessName &&
    !item.flags.reddit &&
    item.flags.sponsorFriendly &&
    computeConfidenceScore(item) >= 50
  );
}

export function isWorldCupEligible(item: InventoryItem, now = new Date()): boolean {
  return item.flags.worldCup && isWorldCupSeasonActive(now);
}

export function isNewOpeningEligible(item: InventoryItem): boolean {
  return (
    item.flags.businessOpening ||
    (item.category != null && OPENING_CATEGORIES.has(item.category))
  );
}

export function analyticsBoostForCategory(
  category: string | null,
  categoryPerformance: Map<string, number>,
): number {
  if (!category) return 0;
  const normalized = category.replace(/_/g, ' ').toLowerCase();
  for (const [key, index] of categoryPerformance) {
    if (normalized.includes(key) || key.includes(normalized.split(' ')[0] ?? '')) {
      return index;
    }
  }
  return 0;
}
