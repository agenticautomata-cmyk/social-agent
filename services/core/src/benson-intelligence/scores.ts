import type { InventoryItem } from '../inventory/normalize.js';
import {
  computeAllScores,
  analyticsBoostForCategory,
} from '../sponsor-intelligence/scoring.js';
import type { BensonIntelligenceContext } from './context.js';
import { analyticsBoostFromIndex, lookupSimilarAnalytics } from './analytics-similar.js';
import type { BensonScores, LinkedPipelineOpportunity } from './types.js';

const REVENUE_ACTIVE_STATUSES = new Set(['proposal_sent', 'negotiating']);
const REVENUE_WARM_STATUSES = new Set(['interested', 'meeting_scheduled']);
const WON_STATUS = 'won';

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isWithinHours(iso: string | null, now: Date, hours: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const ms = now.getTime() - d.getTime();
  return ms >= 0 && ms <= hours * 60 * 60 * 1000;
}

function engagementFlagCount(item: InventoryItem): number {
  const f = item.flags;
  return [
    f.celebrityCharity,
    f.freeEvent,
    f.sports,
    f.worldCup,
    f.dining,
    f.luxury,
    f.dateNight,
  ].filter(Boolean).length;
}

export function computeTrendScore(item: InventoryItem, now: Date): number {
  let score = 0;
  if (isWithinHours(item.discoveredAt ?? item.createdAt, now, 72)) score += 35;
  else if (isWithinHours(item.discoveredAt ?? item.createdAt, now, 168)) score += 20;
  score += engagementFlagCount(item) * 5;
  score += item.audienceScore * 3;
  if (!item.flags.reddit) score += 8;
  return clamp(score);
}

function pipelineRevenueBoost(linked: LinkedPipelineOpportunity[]): number {
  let boost = 0;
  for (const opp of linked) {
    if (REVENUE_ACTIVE_STATUSES.has(opp.status)) boost = Math.max(boost, 30);
    else if (REVENUE_WARM_STATUSES.has(opp.status)) boost = Math.max(boost, 18);
    else if (opp.status === WON_STATUS) boost = Math.max(boost, 12);
    else boost = Math.max(boost, 8);
  }
  return boost;
}

export function computeBensonScores(
  item: InventoryItem,
  context: BensonIntelligenceContext,
  linked: LinkedPipelineOpportunity[],
  now: Date,
): BensonScores {
  const analyticsBoost = analyticsBoostFromIndex(item.category, context.categoryAnalytics);
  const legacyBoost = analyticsBoostForCategory(
    item.category,
    new Map(
      [...context.categoryAnalytics.entries()].map(([k, v]) => [k, v.performanceIndex]),
    ),
  );
  const boost = Math.max(analyticsBoost, legacyBoost);

  const base = computeAllScores(item, boost);

  const revenue = clamp(base.revenuePotential + pipelineRevenueBoost(linked));
  const trend = computeTrendScore(item, now);

  return {
    audience: base.audienceFit,
    sponsor: base.sponsorFit,
    revenue,
    trend,
    confidence: base.confidence,
  };
}

export function buildWhyBensonPicked(
  item: InventoryItem,
  scores: BensonScores,
  linked: LinkedPipelineOpportunity[],
  context: BensonIntelligenceContext,
): string[] {
  const reasons: string[] = [];

  if (scores.audience >= 70) {
    reasons.push('High engagement potential.');
  } else if (scores.audience >= 50) {
    reasons.push('Solid audience fit for Kellie\'s KC lifestyle content.');
  }

  const similar = lookupSimilarAnalytics(item.category, context.categoryAnalytics);
  if (similar && similar.sampleSize >= 2 && similar.avgViews != null) {
    const strong =
      similar.avgViews >= 5000 ||
      (similar.avgEngagementRate != null && similar.avgEngagementRate >= 0.05);
    if (strong) reasons.push('Strong historical performance.');
  }

  const activeDeal = linked.some((o) => REVENUE_ACTIVE_STATUSES.has(o.status));
  const warmDeal = linked.some((o) => REVENUE_WARM_STATUSES.has(o.status));
  if (activeDeal || warmDeal) {
    reasons.push('Linked to active sponsor opportunity.');
  } else if (linked.length > 0) {
    reasons.push('Connected to sponsor pipeline.');
  }

  if (scores.trend >= 55) {
    reasons.push('Trending this week.');
  }

  if (scores.confidence >= 70) {
    reasons.push('High-confidence verified source.');
  }

  if (scores.sponsor >= 60 && !reasons.some((r) => r.includes('sponsor'))) {
    reasons.push('Strong sponsor-fit signals.');
  }

  if (scores.revenue >= 65 && !activeDeal) {
    reasons.push('High revenue alignment for partnerships.');
  }

  if (reasons.length === 0) {
    reasons.push(item.whyItMatters || 'Worth a look in today\'s KC content mix.');
  }

  return reasons.slice(0, 4);
}
