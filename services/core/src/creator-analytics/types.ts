import type { Platform } from '../schema.js';

export type MetricsSource = 'import' | 'manual' | 'api_display' | 'api_business' | 'demo';

export interface ImportVideoRow {
  video_id: string;
  title?: string | null;
  caption?: string | null;
  post_url?: string | null;
  thumbnail_url?: string | null;
  published_at: string;
  content_category?: string | null;
  content_pillar?: string | null;
  location_tag?: string | null;
  sponsor_tag?: string | null;
  opportunity_id?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  watch_time_seconds?: number | null;
  average_watch_duration_seconds?: number | null;
  completion_rate?: number | null;
  follower_count_snapshot?: number | null;
  engagement_rate?: number | null;
  /** When true on an existing video, update metadata but keep the latest metrics snapshot. */
  preserve_metrics?: boolean;
}

export interface ManualImportPayload {
  platform?: Platform;
  username?: string;
  video: ImportVideoRow;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export interface VideoWithMetrics {
  id: string;
  platform: Platform;
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
  totalEngagement: number;
  avgEngagementRate: number;
  videoCount: number;
}

export type RecommendationType =
  | 'repeat_topic'
  | 'repeat_location'
  | 'repeat_sponsor_type'
  | 'post_time'
  | 'avoid_category';

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
  dataSource: 'live' | 'demo';
  platform: Platform;
  account: {
    id: string;
    username: string;
    displayName: string | null;
    videoCount: number;
    platformUserId?: string | null;
    usernameAvailable?: boolean;
  } | null;
  connection?: {
    status: string;
    platformUserId: string | null;
    platformUsername: string | null;
    usernameAvailable: boolean;
    connectedAt: string | null;
    expiresAt: string | null;
    scopes: string[];
    lastSuccessfulSyncAt: string | null;
  } | null;
  followersAvailable: boolean;
  followersCount: number | null;
  trendLabels: {
    views: string;
    engagement: string;
  };
  summary: {
    totalVideos: number;
    totalViews: number;
    avgEngagementRate: number;
    medianViews: number;
    dataThrough: string | null;
  };
  topVideos: VideoWithMetrics[];
  recentVideos: VideoWithMetrics[];
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

export interface AnalyticsHubConnectorSummary {
  provider: string;
  label: string;
  connected: boolean;
  accountStatus: string;
  accountId: string | null;
  accountName: string | null;
  followers: number | null;
  followersAvailable?: boolean;
  postCount: number | null;
  totalViews: number | null;
  totalEngagement: number | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncError: string | null;
  syncStatus: string;
  settingsHref: string;
}

export interface AnalyticsHubSummary {
  demoMode: boolean;
  readOnly: boolean;
  syncInProgress: boolean;
  connectors: AnalyticsHubConnectorSummary[];
  platforms: Array<{
    platform: Platform;
    label: string;
    videoCount: number;
    totalViews: number;
    available: boolean;
    href: string;
  }>;
  connectorSettings: {
    facebook: { enabled: boolean };
    instagram: { enabled: boolean };
    youtube: { enabled: boolean };
  };
}

export const CSV_TEMPLATE_HEADER =
  'video_id,title,caption,post_url,thumbnail_url,published_at,content_category,content_pillar,location_tag,sponsor_tag,opportunity_id,views,likes,comments,shares,saves,watch_time_seconds,average_watch_duration_seconds,completion_rate,follower_count_snapshot';
