import type { ConciergePick } from './concierge-picks.js';
import type { SaveConciergePickResult } from './save-concierge-pick.js';

export type { ConciergePick } from './concierge-picks.js';
export type { SaveConciergePickResult, ConciergeSaveAction } from './save-concierge-pick.js';

export const ASK_BENSON_PROMPT_VERSION = 'v24-studio-navigation';

export const ASK_BENSON_CACHE_MS = 60 * 60 * 1000;

export const ASK_BENSON_STARTER_QUESTIONS = [
  'What should I post next?',
  'Who should I pitch first?',
  'Why are my views down?',
  'Walk me through what my metrics are actually saying',
  'Compare my best and worst categories — why the gap?',
  'What is my best posting time?',
  'What content performs best?',
  'What should I stop doing?',
] as const;

export type AskBensonTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
};

export type AskBensonCollectedOpportunity = {
  contentItemId: string;
  title: string;
  location: string | null;
  eventStartsAt: string | null;
  relevanceScore: number;
  urgencyScore: number;
  outcome: 'created' | 'updated';
  sourceUrl: string | null;
};

export type AskBensonCollectionResult = {
  documentTitle: string | null;
  extractedCount: number;
  created: number;
  updated: number;
  enrichmentsAttempted: number;
  webResearchAttempted?: number;
  sourceProposalsCreated?: number;
  scrapeSourcesRegistered?: number;
  source?: 'image' | 'link' | 'lookup' | 'enrich';
  lookupQuery?: string;
  sourceUrls?: string[];
  scoredCount?: number;
  intakeError?: string | null;
  items: AskBensonCollectedOpportunity[];
};

export type AskBensonResponse = {
  ok: boolean;
  answer: string;
  evidence: string[];
  suggestedActions: string[];
  usedData: string[];
  confidence: number;
  conversationId: string;
  messageId: string | null;
  cached: boolean;
  tokenUsage: AskBensonTokenUsage | null;
  estimatedCost: number | null;
  collection?: AskBensonCollectionResult | null;
  conciergePicks?: ConciergePick[];
  conciergeSaveResult?: SaveConciergePickResult | null;
  error?: string;
};

export type AskBensonImageAttachment = {
  dataUrl: string;
  mimeType: string;
  fileSize: number;
  originalFilename: string;
  contentHash: string;
};

export type AskBensonRequest = {
  message: string;
  pageContext?: string;
  conversationId?: string;
  mediaKitId?: string;
  image?: AskBensonImageAttachment | null;
};

export type AskBensonMediaKitContext = {
  id: string;
  name: string;
  description: string | null;
  targetAudience: string | null;
  version: string;
  fileUrl: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  hasUploadedFile: boolean;
  /** File bytes are stored but not parsed — Benson must not invent document contents. */
  fileContentNotParsed: true;
};

export type AskBensonStructuredAnswer = {
  answer: string;
  evidence: string[];
  suggestedActions: string[];
  usedData: string[];
  confidence: number;
};

export type AskBensonGroundedContext = {
  snapshotVersion: string;
  now: {
    local: string;
    partOfDay: 'morning' | 'afternoon' | 'evening';
    timezone: string;
  };
  creator: {
    username: string;
    displayName: string;
    platform: string;
    dataSource: 'live' | 'demo';
  };
  connection: {
    tiktokConnected: boolean;
    connectionStatus: string;
    platformUsername: string | null;
    lastSuccessfulSyncAt: string | null;
    lastSyncAt: string | null;
    scopes: string[];
    followersAvailable: boolean;
    followersCount: number | null;
    followersUnavailableReason: string | null;
  };
  analyticsSummary: {
    totalVideos: number;
    totalViews: number;
    medianViews: number;
    avgEngagementRate: number;
    views30d: number;
    videosPerWeek: number;
    dataThrough: string | null;
  };
  topVideos: Array<{
    title: string | null;
    views: number;
    engagementRate: number;
    category: string | null;
    location: string | null;
    publishedAt: string;
  }>;
  topCategories: Array<{
    category: string;
    videoCount: number;
    avgViews: number;
    avgEngagementRate?: number;
    performanceIndex: number;
    trend?: 'rising' | 'stable' | 'declining' | 'unknown';
  }>;
  categoryPerformance: Array<{
    category: string;
    videoCount: number;
    avgViews: number;
    avgEngagementRate: number;
    performanceIndex: number;
    trend: 'rising' | 'stable' | 'declining' | 'unknown';
  }>;
  topLocations: Array<{
    location: string;
    videoCount: number;
    avgViews: number;
    performanceIndex: number;
  }>;
  recommendedPostTimes: Array<{
    label: string;
    videoCount: number;
    avgViews: number;
    performanceIndex: number;
  }>;
  avoidPostTimes: Array<{ label: string; performanceIndex: number; videoCount: number }>;
  postingFrequency: {
    videosLast30d: number;
    videosPerWeek: number;
    avgDaysBetweenPosts: number | null;
  };
  postingTimeSample: {
    computedAt: string | null;
    timezone: string | null;
    sampleSize: number | null;
  };
  growthTrend: Array<{
    period: string;
    totalViews: number;
    totalEngagement: number;
    videoCount: number;
  }>;
  engagementTrend: Array<{
    period: string;
    totalViews: number;
    totalEngagement: number;
    videoCount: number;
  }>;
  recentVideos: Array<{
    title: string | null;
    views: number;
    engagementRate: number;
    category: string | null;
    location: string | null;
    publishedAt: string;
    vsMedianPct: number | null;
  }>;
  underperformers: Array<{
    label: string;
    dimension: string;
    performanceIndex: number;
    avgViews: number;
    videoCount: number;
  }>;
  topBusinesses: Array<{
    name: string;
    mentions: number;
    totalViews: number;
    type: string;
  }>;
  sponsorCandidates: Array<{
    name: string;
    score: number;
    mentions: number;
    totalViews: number;
  }>;
  sponsorProofVideos: Array<{
    businessName: string;
    title: string | null;
    views: number;
    postUrl: string | null;
  }>;
  strategistBriefing: {
    summary: string | null;
    topOpportunities: string[];
    topRisks: string[];
    stopDoing: string | null;
    recommendedPostTimes: string[];
    bestSponsorProspect: string | null;
    briefingAge: string | null;
  } | null;
  recentGrowth: Array<{
    period: string;
    viewsChangePct: number;
    engagementChangePct: number;
  }>;
  recentDeclines: Array<{
    dimension: string;
    value: string;
    performanceIndex: number;
  }>;
  dataLimitations: string[];
  pageContext?: string;
  mediaKit?: AskBensonMediaKitContext | null;
  collectedFromImage?: AskBensonCollectionResult | null;
  collectedFromLink?: AskBensonCollectionResult | null;
  pipelineHealth: {
    tiktokStatus: string;
    hoursSinceSync: number | null;
    isStale: boolean;
    canTrustLiveMetrics: boolean;
    reconnectUrl: string;
    dataThrough: string | null;
  };
  recentPhrasing?: string[];
  latestPost: {
    title: string;
    publishedAt: string;
    publishedAtLocal: string;
    postedLabel: string;
    hoursSincePost: number;
    views: number;
    engagementRate: number;
    category: string | null;
    location: string | null;
    vsMedianPct: number | null;
  } | null;
  latestProgressBrief: {
    headline: string;
    progressSummary: string;
    whatChanged: string[];
    suggestedNextStep: string | null;
    createdAt: string;
  } | null;
  creatorContactInfo: {
    sendAsGmail: string | null;
    domain: string;
    channels: Array<{
      id: string;
      label: string;
      email: string;
      purpose: string;
    }>;
  };
  creatorPreferences: {
    excludedCategories: string[];
    categoryNotes: Record<string, string>;
  };
  bensonLearnings: {
    summary: string;
    insights: Array<{
      id: string;
      category: string;
      insight: string;
      confidence: string;
    }>;
    updatedAt: string;
  } | null;
  topOpportunities: Array<{
    title: string;
    category: string | null;
    location: string | null;
    eventDate: string | null;
    bensonScore: number;
    why: string;
  }>;
  inventorySearch: {
    dateWindow: string;
    keywords: string[];
    matchCount: number;
    widenedFrom: string | null;
    matches: Array<{
      id: string;
      title: string;
      summary: string | null;
      category: string | null;
      eventDate: string | null;
      eventDateLabel: string | null;
      location: string | null;
      venue: string | null;
      sourceName: string | null;
      whyItMatters: string;
      reviewUrl: string;
      matchReasons: string[];
    }>;
  } | null;
  conciergeWebResearch: {
    ok: boolean;
    searchQuery: string;
    summary: string | null;
    citations: Array<{ url: string; title: string | null }>;
    error?: string;
  } | null;
  conciergePicks: ConciergePick[] | null;
  studioRoutes: Array<{
    href: string;
    label: string;
    section: string;
    description: string;
  }>;
  openTasks: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    href: string | null;
    section: string;
    priority: string;
  }>;
};
