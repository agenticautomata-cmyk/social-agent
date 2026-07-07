import type { CommandCenterCard } from './command-center-types';
import type { SponsorRecommendation } from './sponsor-intelligence-types';

export type PreAlphaStatus = {
  ok: boolean;
  demoMode: boolean;
  database: 'ok' | 'error';
  outreach: { mode: 'live' | 'simulate'; liveEnabled: boolean };
  safety: { liveSendBlocked: boolean; preAlphaReady: boolean };
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
  studioPulse?: {
    pendingEmailApprovals: number;
    unreadInboxReplies: number;
    followerCount: number | null;
    followerTarget: number;
    followerProgressPct: number | null;
    followersToGo: number | null;
    milestoneReached: boolean;
    nearMilestone: boolean;
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
