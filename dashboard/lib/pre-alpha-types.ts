import type { CommandCenterCard } from './command-center-types';
import type { SponsorRecommendation } from './sponsor-intelligence-types';

export type PreAlphaStatus = {
  ok: boolean;
  demoMode: boolean;
  database: 'ok' | 'error';
  outreach: { mode: 'live' | 'simulate'; liveEnabled: boolean; liveReady: boolean };
  safety: { liveSendBlocked: boolean; preAlphaReady: boolean };
};

export type HomeShowroomAction = {
  label: string;
  href: string;
  kind: 'primary' | 'secondary' | 'dismiss' | 'later' | 'details';
};

export type HomeShowroomCard = {
  id: string;
  title: string;
  reason: string;
  statusLabel?: string | null;
  href: string | null;
  contentItemId?: string | null;
  actions: HomeShowroomAction[];
};

export type HomeShowroom = {
  hero: {
    headline: string;
    subline: string;
    stats: Array<{ label: string; value: number }>;
  };
  sinceLastSync?: {
    headline: string;
    points: Array<{ id: string; text: string }>;
    quiet: boolean;
    previousCheckpointAt: string | null;
  };
  businessSummary?: Array<{ id: string; text: string }>;
  bestMove: HomeShowroomCard | null;
  moneyOnTheTable: HomeShowroomCard[];
  whatBensonHandled: Array<{ id: string; text: string }>;
  creatorAnalytics?: {
    followers: {
      count: number;
      target: number;
      progressPct: number | null;
      remaining: number | null;
      milestoneReached: boolean;
      nearMilestone: boolean;
      trendLabel: string | null;
    } | null;
    activeDeals: number | null;
    sponsorPipelineActive: number | null;
    pendingOutreach: number | null;
    revenueUsd: number | null;
    tiles: Array<{
      id: string;
      label: string;
      value: string;
      sub?: string | null;
      href?: string | null;
    }>;
  };
  creatorMomentum: Array<{ id: string; label: string; value: string; href?: string | null }>;
  needsYou: HomeShowroomCard[];
  todaysBrief?: {
    headline: string | null;
    changes: string[];
    overflowChanges?: string[];
    followerLine?: string | null;
    asOf: string | null;
    anomaly: string | null;
  };
  worthALook?: Array<{
    id: string;
    title: string;
    whatItIs: string;
    whenWhere: string | null;
    reason: string;
    bestUse: 'film' | 'share' | 'research' | 'contact';
    verificationGap: string | null;
    sourceUrl: string | null;
    contentItemId: string;
    href: string;
  }>;
  analyticsSnapshot?: {
    asOf: string | null;
    followers: number | null;
    followerDelta: number | null;
    headline: string | null;
    changes: string[];
    suppressedChanges: string[];
    anomaly: string | null;
    comparisonInterval?: { from: string; to: string } | null;
    latestVideoId?: string | null;
    overflowChanges?: string[];
    followerLine?: string | null;
    videoIds?: string[];
  };
};

export type PreAlphaHome = {
  demoMode: boolean;
  generatedAt: string;
  greeting: string;
  subline: string;
  priorities: Array<{ rank: number; label: string; href: string | null }>;
  quickLinks: Array<{ href: string; label: string; description: string }>;
  stats: {
    openActions: number;
    overdueActions: number;
    pipelineValue: number;
    openDeals: number;
    outreachMode: string;
  };
  systemOk: boolean;
  showroom?: HomeShowroom;
  metrics: {
    totalSources: number;
    healthySources: number;
    contentItems: number;
    sponsorCandidates: number;
    activePipelineDeals: number;
    sponsorLeads: number;
    activeDeals: number;
    pendingOutreach: number;
    connectedAccounts: number;
  };
  sourceHealth: {
    totalSources: number;
    healthySources: number;
    unhealthySources: number;
    disabledSources: number;
  };
  refresh: {
    lastRefreshAt: string | null;
    itemsDiscovered: number;
    healthySources: number;
    failedSources: number;
    newItemsSinceRefresh: number;
  };
  topOpportunities: CommandCenterCard[];
  topSponsorCandidates: SponsorRecommendation[];
  dailyBriefing: {
    topEvents: CommandCenterCard[];
    topSponsorOpportunities: SponsorRecommendation[];
    topBusinessOpenings: CommandCenterCard[];
    highestPriority: CommandCenterCard[];
    askBensonToday: CommandCenterCard[];
  };
  aiSpend?: {
    todayCostUsd: number;
    dailyAverageUsd: number;
    budgetUsd: number | null;
    budgetExceeded: boolean;
    breakdown: Array<{ source: string; runs: number; costUsd: number }>;
  } | null;
  studioPulse?: {
    pendingEmailApprovals: number;
    unreadInboxReplies: number;
    followerCount: number | null;
    followerTarget: number;
    followerProgressPct: number | null;
    followersToGo: number | null;
    milestoneReached: boolean;
    nearMilestone: boolean;
    topPendingApprovalHref?: string | null;
    topSponsorPitchHref: string | null;
    topSponsorPitchLabel: string | null;
    outreachMode: 'live' | 'simulate';
  };
};

export const NOT_USEFUL_REASONS = [
  { code: 'wrong_timing', label: 'Wrong timing' },
  { code: 'wrong_sponsor_fit', label: 'Wrong sponsor fit' },
  { code: 'already_covered', label: 'Already covered' },
  { code: 'missing_context', label: 'Missing context' },
  { code: 'low_confidence', label: 'Too low confidence' },
  { code: 'other', label: 'Other' },
] as const;
