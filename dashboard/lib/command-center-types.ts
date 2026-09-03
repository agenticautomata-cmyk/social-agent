export type FitLevel = 'high' | 'medium' | 'low' | 'none';

export type CommandCenterMetric = {
  level: FitLevel;
  score: number;
  label: string;
};

export type CardTracking = {
  saved: boolean;
  covered: boolean;
  note: string | null;
  followUpAt: string | null;
};

export type BensonScores = {
  audience: number;
  sponsor: number;
  revenue: number;
  trend: number;
  confidence: number;
};

export type BensonAnalyticsSimilar = {
  category: string | null;
  avgViews: number | null;
  avgEngagementRate: number | null;
  avgCompletionRate: number | null;
  sampleSize: number;
};

export type LinkedPipelineOpportunity = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  estimatedValue: number | null;
  sponsorBusinessName: string;
  plannerListName: string | null;
};

export type TodayPrimaryAction = {
  kind: string;
  label: string;
  plannerAction: 'plan_weekend' | 'plan_today' | 'plan_this_week' | 'save' | null;
};

export type CommandCenterCard = {
  id: string;
  title: string;
  whyItMatters: string;
  confidence: CommandCenterMetric;
  audienceFit: CommandCenterMetric;
  sponsorPotential: CommandCenterMetric;
  sourceUrl: string | null;
  sourceName: string | null;
  category: string | null;
  tracking?: CardTracking;
  bensonScores?: BensonScores;
  whyBensonPicked?: string[];
  analyticsSimilar?: BensonAnalyticsSimilar | null;
  linkedPipelineOpportunities?: LinkedPipelineOpportunity[];
  displayTitle?: string;
  lane?: string;
  laneLabel?: string;
  whySummary?: string;
  whenLabel?: string | null;
  whereLabel?: string | null;
  primaryAction?: TodayPrimaryAction;
  coverageFormatLabel?: string | null;
  showMarkCovered?: boolean;
  showSave?: boolean;
  viewSourceUrl?: string | null;
  hideScoreDashboard?: boolean;
};

export type BensonBriefingPriority = {
  rank: number;
  label: string;
  href: string | null;
  kind: 'pipeline' | 'content' | 'outreach' | 'planner' | 'analytics';
};

export type CommandCenterSectionId =
  | 'postToday'
  | 'postWeekend'
  | 'contactBusinesses'
  | 'highestConfidence'
  | 'trending'
  | 'worldCupVisitors'
  | 'followUpsDue'
  | 'discoveredToday';

export type CommandCenterResponse = {
  demoMode: boolean;
  generatedAt: string;
  limit: number;
  sections: Record<
    CommandCenterSectionId,
    {
      question: string;
      description: string;
      items: CommandCenterCard[];
    }
  >;
  counts: {
    saved: number;
    plannedThisWeek: number;
    covered: number;
    skipped: number;
    followUpsDue: number;
    discoveredToday: number;
  };
  weekItems: CommandCenterCard[];
  savedItems: CommandCenterCard[];
  coveredItems: CommandCenterCard[];
  briefingPriorities?: BensonBriefingPriority[];
  categoryOptions?: Array<{ category: string; count: number }>;
};

export type EditorTab = 'today' | 'week' | 'saved' | 'covered';

export type TodayActionId =
  | 'open'
  | 'mark_done'
  | 'reschedule'
  | 'remove_from_today'
  | 'view_details'
  | 'review'
  | 'add_to_today'
  | 'add_to_calendar'
  | 'dismiss';

export type TodayWorkItem = {
  id: string;
  contentItemId: string | null;
  placement: string;
  kind: string;
  title: string;
  rawTitle: string | null;
  subtitle: string | null;
  why: string | null;
  whenLabel: string | null;
  whereLabel: string | null;
  sourceUrl: string | null;
  detailsHref: string;
  dueDate: string | null;
  eventDate: string | null;
  verifiedFacts: string[];
  actions: TodayActionId[];
  origin: 'user' | 'benson';
  dueToday: boolean;
};

export type TodayPriority = {
  rank: number;
  label: string;
  href: string | null;
  kind: 'plan' | 'review' | 'deadline' | 'follow_up';
};

export type TodayExecutionWorkspace = {
  generatedAt: string;
  empty: boolean;
  emptyMessage: string;
  emptyActions: Array<{ label: string; href: string }>;
  plan: TodayWorkItem[];
  bestMove: TodayWorkItem | null;
  bestMoveEmpty: string;
  review: TodayWorkItem[];
  reviewTotal: number;
  reviewQueueHref: string;
  comingUp: TodayWorkItem[];
  completedToday: { count: number; items: TodayWorkItem[] };
  pendingResearch: TodayWorkItem[];
  priorities: TodayPriority[];
  /** Partnership decisions: approve a pitch, answer a business, unblock a contact. */
  partnershipDecisions: TodayWorkItem[];
};

export type TodayEditorResponse = {
  demoMode: boolean;
  generatedAt: string;
  execution: TodayExecutionWorkspace;
};

/** Today render order — worldCupVisitors intentionally omitted (zero UI space). */
export const COMMAND_CENTER_SECTION_ORDER: CommandCenterSectionId[] = [
  'postToday',
  'postWeekend',
  'contactBusinesses',
  'followUpsDue',
  'discoveredToday',
  'trending',
];

const METRIC_TONE: Record<FitLevel, string> = {
  high: 'text-accent font-bold',
  medium: 'text-paper-ink',
  low: 'text-paper-muted',
  none: 'text-paper-dim',
};

export function metricTone(level: FitLevel): string {
  return METRIC_TONE[level] ?? 'text-paper-muted';
}
