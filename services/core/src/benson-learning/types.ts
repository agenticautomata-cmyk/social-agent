export const LESSON_TYPES = [
  'durable_preference',
  'recent_performance_signal',
  'test_needed',
  'temporary_trend',
  'retired_lesson',
] as const;

export type LessonType = (typeof LESSON_TYPES)[number];

export const LESSON_CATEGORIES = [
  'content',
  'timing',
  'voice',
  'sponsor',
  'category',
  'posting',
  'performance',
] as const;

export type LessonCategory = (typeof LESSON_CATEGORIES)[number];

export type LessonDurability = 'durable' | 'temporary' | 'test';

export type BensonInsight = {
  id: string;
  category: LessonCategory;
  insight: string;
  confidence: 'high' | 'medium' | 'low';
  lessonType: LessonType;
  durability: LessonDurability;
  evidenceSource: string;
  evidenceDateRange: string;
  materialChangeSinceLastShown: boolean;
  lastShownAt: string | null;
  action: string;
  timelyUntil: string | null;
};

export type TimelyOpportunitySignal = {
  id: string;
  title: string;
  category: string | null;
  eventDate: string | null;
  lifecycleStatus: string | null;
  composite: number | null;
  actionWindow: string;
};

export type PerformanceSignal = {
  title: string;
  category: string | null;
  publishedAt: string;
  views: number;
  performanceIndex: number;
  engagementRate: number;
  sampleSize: number;
  vsBaseline: 'above' | 'at' | 'below';
  conclusion: string;
  confidence: 'high' | 'medium' | 'low';
};

export type LearningSignalSnapshot = {
  collectedAt: string;
  analyticsWindow: string;
  preferenceEvents: import('../creator-preferences/index.js').PreferenceLogEntry[];
  feedbackEvents: Array<{
    at: string;
    sentiment: string | null;
    reasonCode: string | null;
    comment: string | null;
    route: string;
  }>;
  chatFeedbackEvents: Array<{
    at: string;
    sentiment: string;
    reasonCode: string | null;
    comment: string | null;
    answerPreview: string;
  }>;
  plannerActions: Array<{
    title: string;
    category: string | null;
    status: string;
    listName: string;
    plannedDate: string | null;
    eventDate: string | null;
    lifecycleStatus: string | null;
    updatedAt: string;
  }>;
  skippedOpportunities: Array<{
    title: string;
    category: string | null;
    updatedAt: string;
    sampleSize: number;
  }>;
  passedOpportunities: Array<{
    phrase: string;
    reason: string;
    at: string;
  }>;
  topPerformingPosts: Array<{
    title: string;
    views: number;
    category: string | null;
    location: string | null;
    publishedAt: string;
    performanceIndex: number;
    engagementRate: number;
    vsBaseline: 'above' | 'at' | 'below';
  }>;
  performanceSignals: PerformanceSignal[];
  timelyOpportunities: TimelyOpportunitySignal[];
  savedCategories: string[];
  outcomeExecution: Array<{
    classification: string | null;
    userResponse: string | null;
    category: string | null;
    executed: boolean;
    posted: boolean;
    views: number | null;
    linkConfidence: number;
  }>;
};

export const NOTHING_NEW_SUMMARY =
  'No meaningful new creator lessons since the last update.';
