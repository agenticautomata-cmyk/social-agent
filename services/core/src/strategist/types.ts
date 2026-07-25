export const STRATEGIST_PROMPT_VERSION = 'v7-posting-clock';

export const STRATEGIST_CACHE_MS = 24 * 60 * 60 * 1000;

export type StrategistTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
};

export type CreatorProfileCategory = {
  category: string;
  videoCount: number;
  avgViews: number;
  avgEngagementRate: number;
  performanceIndex: number;
  trend: 'rising' | 'stable' | 'declining' | 'unknown';
};

export type CreatorProfilePostingTime = {
  bucket: string;
  videoCount: number;
  avgViews: number;
  performanceIndex: number;
};

export type CreatorProfilePostTimeSlot = {
  weekday: string;
  hour: number;
  minute: number;
  timezone: string;
  label: string;
  videoCount: number;
  avgViews: number;
  avgEngagementRate: number;
  performanceIndex: number;
};

export type CreatorProfileBusiness = {
  name: string;
  mentions: number;
  totalViews: number;
  type: 'local' | 'chain';
};

export type CreatorProfileSponsorCandidate = {
  name: string;
  score: number;
  mentions: number;
  totalViews: number;
};

export type CreatorProfileTrendPoint = {
  period: string;
  totalViews: number;
  totalEngagement: number;
  videoCount: number;
};

export type CreatorProfilePeriodChange = {
  period: string;
  viewsChangePct: number;
  engagementChangePct: number;
  videoCount: number;
};

export type CreatorProfileDecline = {
  dimension: string;
  value: string;
  performanceIndex: number;
  avgViews: number;
  videoCount: number;
};

export type CreatorStrategistProfile = {
  creator: string;
  displayName: string;
  creatorId: string;
  platform: string;
  dataSource: 'live' | 'demo';
  periodDays: number;
  views30d: number;
  engagementRate: number;
  postingFrequency: {
    videosLast30d: number;
    videosPerWeek: number;
    avgDaysBetweenPosts: number | null;
  };
  bestPostingDays: CreatorProfilePostingTime[];
  postingTimes: CreatorProfilePostingTime[];
  recommendedPostTimes: CreatorProfilePostTimeSlot[];
  avoidPostTimes: CreatorProfilePostTimeSlot[];
  postingTimeAnalytics: {
    computedAt: string;
    timezone: string;
    sampleSize: number;
  } | null;
  growthTrend: CreatorProfileTrendPoint[];
  engagementTrend: CreatorProfileTrendPoint[];
  recentGrowth: CreatorProfilePeriodChange[];
  recentDeclines: CreatorProfileDecline[];
  topCategories: CreatorProfileCategory[];
  categoryPerformance: CreatorProfileCategory[];
  topBusinesses: CreatorProfileBusiness[];
  sponsorCandidates: CreatorProfileSponsorCandidate[];
  businessMentionFrequency: Array<{
    name: string;
    mentions: number;
    shareOfMentionsPct: number;
  }>;
  audienceSignals: {
    followersAvailable: boolean;
    followersCount: number | null;
    connectedPlatforms: string[];
    lastSyncAt: string | null;
    scopes: string[];
    dataThrough: string | null;
  };
  summaryStats: {
    totalVideos: number;
    totalViews: number;
    medianViews: number;
    avgEngagementRate: number;
  };
};

export type StrategistAnalysis = {
  summary: string;
  whatsWorking: string[];
  whatsNotWorking: string[];
  recommendedActions: string[];
  bensonObservation: string | null;
  opportunities: string[];
  risks: string[];
  contentRecommendations: string[];
  sponsorRecommendations: string[];
  scheduleRecommendations: string[];
  experiments: string[];
  stopDoing: string;
};

export type StrategistBriefingHighlights = {
  topOpportunities: string[];
  topRisks: string[];
  nextContentRecommendation: string | null;
  bestSponsorProspect: string | null;
  recommendedPostingDay: string | null;
  recommendedPostTimes: string[];
};

export type OperationalFreshnessItem = {
  id: string;
  title: string;
  category: string | null;
  eventDate: string | null;
  createdAt: string | null;
  sourceName: string | null;
};

export type OperationalScrapeSource = {
  id: string;
  name: string;
  feedUrl: string | null;
  createdAt: string;
};

export type OperationalTikTokConnection = {
  status: string;
  connected: boolean;
  platformUsername: string | null;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  recentlyConnected: boolean;
};

export type OperationalFreshness = {
  generatedAt: string;
  askBensonToday: OperationalFreshnessItem[];
  discoveredToday: OperationalFreshnessItem[];
  newScrapeSources: OperationalScrapeSource[];
  tiktokConnection: OperationalTikTokConnection;
  lastSourceRefresh: {
    lastRefreshAt: string | null;
    itemsDiscovered: number;
    newItemsSinceRefresh: number;
  };
};

export type StrategistBriefingResponse = {
  ok: boolean;
  cached: boolean;
  stale: boolean;
  staleReason?: 'cache_expired' | 'new_intake_since_analysis' | 'prompt_version' | null;
  cacheExpiresAt: string | null;
  createdAt: string | null;
  promptVersion: string;
  profile: CreatorStrategistProfile | null;
  analysis: StrategistAnalysis | null;
  highlights: StrategistBriefingHighlights | null;
  operationalFreshness: OperationalFreshness | null;
  operationalSnapshotVersion: string | null;
  tokenUsage: StrategistTokenUsage | null;
  estimatedCost: number | null;
  briefingId: string | null;
  needsAnalysis: boolean;
  error?: string;
};
