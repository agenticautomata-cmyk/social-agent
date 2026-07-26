import type { ConciergePick } from './concierge-picks.js';
import type { SaveConciergePickResult } from './save-concierge-pick.js';
import type { UrlIntakeDiagnostics } from './url-intake-pipeline.js';
import type { UrlIntakeSummary } from './url-intake-answer.js';

export type { ConciergePick } from './concierge-picks.js';
export type { SaveConciergePickResult, ConciergeSaveAction } from './save-concierge-pick.js';

export const ASK_BENSON_PROMPT_VERSION = 'v29-no-stale-todos';

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
  urlIntakeDiagnostics?: UrlIntakeDiagnostics[];
  urlIntakeSummary?: UrlIntakeSummary;
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
  draftAssetId?: string;
  contentItemId?: string;
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

import type { CreatorNowClock } from '../datetime.js';

export type AskBensonGroundedContext = {
  snapshotVersion: string;
  now: CreatorNowClock;
  postingScheduleGuidance: string;
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
    historicalLabel: string;
    videoCount: number;
    avgViews: number;
    performanceIndex: number;
    signalStrength: 'weak' | 'moderate' | 'strong';
    nextActionableWindow: string;
    signalNote: string;
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
    isFromPriorDay: boolean;
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
    isFromPriorDay: boolean;
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
    passedOpportunities?: Array<{ phrase: string; reason: string }>;
  };
  liveFieldStatus: {
    shootingNow: boolean;
    headline: string;
    eventName: string;
    location: string;
    eventDate: string;
    activity: string;
    updatedAt: string;
  } | null;
  bensonLearnings: {
    summary: string;
    insights: Array<{
      id: string;
      category: string;
      insight: string;
      confidence: string;
    }>;
    updatedAt: string;
    isStale?: boolean;
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
  draftDiscussion?: Record<string, unknown> | null;
  recordDiscussion?: Record<string, unknown> | null;
  curatorWatchlistLeads?: Array<{
    id: string;
    eventName: string;
    eventDate: string | null;
    venue: string | null;
    verificationStatus: string;
    discoveredViaHandle: string;
    creatorRecommendation: string | null;
    attribution: string;
  }> | null;
  outcomeAnalytics: {
    acceptanceRate: number | null;
    plannedToFilmedRate: number | null;
    filmedToPostedRate: number | null;
    ignoredCategories: Array<{ category: string; count: number }>;
    topViewCategories: Array<{ category: string; avgViews: number; count: number }>;
    recentOutcomes: Array<{
      id: string;
      title: string;
      classification: string | null;
      score: number | null;
      linkConfidence: number;
      views: number | null;
    }>;
  } | null;
  systemHealth: {
    overall: string;
    alertCount: number;
    failedWorkers: Array<{ name: string; status: string; lastError: string | null }>;
    oauthWarnings: string[];
  } | null;
  activeShoot: {
    sessionId: string;
    title: string | null;
    shotIndex: number;
    shotTotal: number;
    status: string;
  } | null;
};
