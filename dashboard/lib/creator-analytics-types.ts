export type RecommendationType =
  | 'repeat_topic'
  | 'repeat_location'
  | 'repeat_sponsor_type'
  | 'post_time'
  | 'avoid_category';

export interface VideoWithMetrics {
  id: string;
  platform: string;
  videoId: string;
  title: string | null;
  caption: string | null;
  postUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  contentCategory: string | null;
  contentPillar: string | null;
  locationTag: string | null;
  sponsorTag: string | null;
  opportunityId: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number | null;
  engagementRate: number;
  watchTimeSeconds: number | null;
  averageWatchDurationSeconds: number | null;
  completionRate: number | null;
  followerCountSnapshot: number | null;
  performanceIndex: number;
  postTimeBucket: string;
}

export interface DimensionPerformance {
  key: string;
  label: string;
  videoCount: number;
  avgViews: number;
  avgEngagementRate: number;
  totalViews: number;
  performanceIndex: number;
}

export interface PatternCard {
  label: string;
  dimensions: Record<string, string>;
  videoCount: number;
  avgViews: number;
  avgEngagementRate: number;
  performanceIndex: number;
  sampleVideoIds: string[];
}

export interface TrendPoint {
  period: string;
  totalViews: number;
  avgEngagementRate: number;
  videoCount: number;
}

export interface AnalyticsRecommendation {
  type: RecommendationType;
  confidence: number;
  message: string;
  evidence: {
    sampleSize: number;
    performanceIndex: number;
    dimension: string;
    value: string;
  };
}

export interface CreatorAnalyticsDashboard {
  demoMode: boolean;
  platform: string;
  account: {
    id: string;
    username: string;
    displayName: string | null;
    videoCount: number;
  } | null;
  summary: {
    totalVideos: number;
    totalViews: number;
    avgEngagementRate: number;
    medianViews: number;
    dataThrough: string | null;
  };
  topVideos: VideoWithMetrics[];
  topCategories: DimensionPerformance[];
  topLocations: DimensionPerformance[];
  topPostingTimes: DimensionPerformance[];
  growthTrend: TrendPoint[];
  engagementTrend: TrendPoint[];
  sponsorPerformance: DimensionPerformance[];
  repeatableWinners: PatternCard[];
  underperformers: PatternCard[];
  recommendations: AnalyticsRecommendation[];
}

export interface AnalyticsHubSummary {
  demoMode: boolean;
  platforms: Array<{
    platform: string;
    label: string;
    videoCount: number;
    totalViews: number;
    available: boolean;
    href: string;
  }>;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  demoMode?: boolean;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function recommendationLabel(type: RecommendationType): string {
  switch (type) {
    case 'repeat_topic':
      return 'repeat this topic';
    case 'repeat_location':
      return 'repeat this location';
    case 'repeat_sponsor_type':
      return 'repeat this sponsor type';
    case 'post_time':
      return 'post at this time';
    case 'avoid_category':
      return 'avoid this category';
    default:
      return type;
  }
}
