export type RecommendationSource =
  | 'tiktok_operator'
  | 'strategist'
  | 'ask_benson'
  | 'planner'
  | 'inventory'
  | 'benson_discovery'
  | 'editor'
  | 'action_center';

export type UserRecommendationResponse =
  | 'accepted'
  | 'planned'
  | 'skipped'
  | 'passed'
  | 'covered'
  | 'abandoned';

export type OutcomeClassification =
  | 'high_value'
  | 'good'
  | 'neutral'
  | 'weak'
  | 'failed_execution'
  | 'insufficient_data';

export type PerformanceSnapshotKind = '2h' | '24h' | '7d' | 'latest';

export type OutcomeAnalyticsSummary = {
  acceptanceRate: number | null;
  plannedToFilmedRate: number | null;
  filmedToPostedRate: number | null;
  postedToSponsorRate: number | null;
  recommendationToRevenueRate: number | null;
  totalRecommendations: number;
  completedRecommendations: number;
  ignoredCategories: Array<{ category: string; count: number }>;
  topViewCategories: Array<{ category: string; avgViews: number; count: number }>;
  topFollowerCategories: Array<{ category: string; avgFollowers: number; count: number }>;
  locationOutcomes: Array<{ location: string; avgScore: number; visits: number }>;
  sponsorCategoryOutcomes: Array<{ category: string; replies: number; deals: number; revenue: number }>;
  recentOutcomes: Array<{
    id: string;
    title: string;
    classification: OutcomeClassification | null;
    score: number | null;
    linkConfidence: number;
    views: number | null;
  }>;
  spendMetrics?: {
    periodDays: number;
    totalSpendUsd: number;
    dailyAverageUsd: number;
    costPerPostedVideo: number | null;
    costPerSponsorReply: number | null;
  } | null;
};
