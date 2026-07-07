import { computeActionCenter } from '../action-center/hub.js';
import { computePipelineDashboard } from '../sponsor-pipeline/opportunities.js';
import { getOutreachSendConfig } from '../sponsor-outreach/send.js';
import { computePreAlphaStatus } from './status.js';
import {
  computeOperationalHomeData,
  type HomeDailyBriefing,
  type HomeOperationalMetrics,
  type HomeOpportunityCard,
  type HomeRefreshSummary,
  type HomeSourceHealth,
} from './operational-home.js';
import { computeStudioPulse, type StudioPulse } from './studio-pulse.js';
import {
  shouldPromoteSponsorCandidate,
  sponsorBriefingLinkFromCandidate,
} from '../sponsor-intelligence/priority.js';
import { localHourInTimezone } from '../datetime.js';
import type { SponsorRecommendation } from '../sponsor-intelligence/recommendations.js';

export type HomeQuickLink = {
  href: string;
  label: string;
  description: string;
};

export type HomePriority = {
  rank: number;
  label: string;
  href: string | null;
};

export type PreAlphaHomeResponse = {
  demoMode: boolean;
  generatedAt: string;
  greeting: string;
  subline: string;
  priorities: HomePriority[];
  quickLinks: HomeQuickLink[];
  stats: {
    openActions: number;
    overdueActions: number;
    pipelineValue: number;
    openDeals: number;
    outreachMode: string;
  };
  systemOk: boolean;
  metrics: HomeOperationalMetrics;
  sourceHealth: HomeSourceHealth;
  refresh: HomeRefreshSummary;
  topOpportunities: HomeOpportunityCard[];
  topSponsorCandidates: SponsorRecommendation[];
  dailyBriefing: HomeDailyBriefing;
  studioPulse: StudioPulse;
};

export async function computePreAlphaHome(options?: {
  now?: Date;
  demoMode?: boolean;
  excludeCategories?: string[];
}): Promise<PreAlphaHomeResponse> {
  const now = options?.now ?? new Date();
  const excludeCategories = options?.excludeCategories;
  const [status, actions, pipeline, operational, studioPulse] = await Promise.all([
    computePreAlphaStatus(),
    computeActionCenter({ now, demoMode: options?.demoMode, excludeCategories }),
    computePipelineDashboard(now),
    computeOperationalHomeData({ excludeCategories }),
    computeStudioPulse(),
  ]);

  const outreach = await getOutreachSendConfig();
  const hour = localHourInTimezone(now);
  const greeting =
    hour < 12 ? 'Good morning, Kellie' : hour < 17 ? 'Good afternoon, Kellie' : 'Good evening, Kellie';

  const quickLinks: HomeQuickLink[] = [
    { href: '/editor', label: 'Today', description: 'Daily briefing and post picks' },
    { href: '/actions', label: 'Actions', description: 'Follow-ups, approvals, and one-click tasks' },
    { href: '/planner', label: 'Planner', description: 'Weekly content plan and shortlist' },
    { href: '/sponsor-intelligence', label: 'Sponsor intel', description: 'Who to contact first' },
    { href: '/sponsors', label: 'Sponsors', description: 'CRM contacts and notes' },
    { href: '/pipeline', label: 'Pipeline', description: 'Deal stages and values' },
    { href: '/email/approvals', label: 'Email', description: 'Benson-drafted pitches awaiting approval' },
    { href: '/revenue', label: 'Revenue', description: 'Business health and forecast' },
    { href: '/benson', label: 'Benson intel', description: 'Cross-system executive summary' },
    { href: '/review/inventory', label: 'Inventory', description: 'Review all opportunities' },
    { href: '/analytics', label: 'Analytics', description: 'TikTok performance (import optional)' },
  ];

  const priorities: HomePriority[] = actions.doNow.slice(0, 4).map((item, i) => ({
    rank: i + 1,
    label: item.title,
    href: item.href,
  }));

  if (priorities.length === 0) {
    priorities.push({
      rank: 1,
      label: 'Open your daily briefing',
      href: '/editor',
    });
  }

  if (studioPulse.pendingEmailApprovals > 0) {
    const label = `${studioPulse.pendingEmailApprovals} pitch${studioPulse.pendingEmailApprovals === 1 ? '' : 'es'} waiting approval`;
    if (!priorities.some((p) => p.href === '/email/approvals')) {
      priorities.unshift({ rank: 1, label, href: '/email/approvals' });
      priorities.forEach((p, i) => {
        p.rank = i + 1;
      });
      if (priorities.length > 4) priorities.length = 4;
    }
  }

  if (studioPulse.unreadInboxReplies > 0) {
    const label = `${studioPulse.unreadInboxReplies} sponsor repl${studioPulse.unreadInboxReplies === 1 ? 'y' : 'ies'} in inbox`;
    if (!priorities.some((p) => p.href === '/email/inbox')) {
      priorities.unshift({ rank: 1, label, href: '/email/inbox' });
      priorities.forEach((p, i) => {
        p.rank = i + 1;
      });
      if (priorities.length > 4) priorities.length = 4;
    }
  }

  if (studioPulse.nearMilestone && studioPulse.followersToGo != null) {
    const label = `${studioPulse.followersToGo.toLocaleString()} followers to 5K 🎆`;
    if (!priorities.some((p) => p.label.includes('5K'))) {
      priorities.unshift({ rank: 1, label, href: '/analytics/tiktok' });
      priorities.forEach((p, i) => {
        p.rank = i + 1;
      });
      if (priorities.length > 4) priorities.length = 4;
    }
  }

  const topSponsor = operational.dailyBriefing.topSponsorOpportunities[0];
  if (topSponsor && shouldPromoteSponsorCandidate(topSponsor)) {
    const link = sponsorBriefingLinkFromCandidate(topSponsor);
    const duplicate = priorities.some((p) => p.href === link.href || p.label === link.label);
    if (!duplicate) {
      priorities.unshift({
        rank: 1,
        label: link.label,
        href: link.href,
      });
      priorities.forEach((p, i) => {
        p.rank = i + 1;
      });
      if (priorities.length > 4) priorities.length = 4;
    }
  }

  if (priorities.length < 4 && operational.topOpportunities[0]) {
    priorities.push({
      rank: priorities.length + 1,
      label: operational.topOpportunities[0].title,
      href: `/review/inventory?id=${operational.topOpportunities[0].id}`,
    });
  }

  return {
    demoMode: options?.demoMode ?? status.demoMode,
    generatedAt: now.toISOString(),
    greeting,
    subline: 'Your Benson home base — live KC ingest, sponsors, and pipeline at a glance.',
    priorities,
    quickLinks,
    stats: {
      openActions: actions.counts.total,
      overdueActions: actions.counts.overdue,
      pipelineValue: pipeline.totalPipelineValue,
      openDeals: pipeline.openDealCount,
      outreachMode: outreach.mode,
    },
    systemOk: status.ok && status.safety.preAlphaReady,
    metrics: operational.metrics,
    sourceHealth: operational.sourceHealth,
    refresh: operational.refresh,
    topOpportunities: operational.topOpportunities,
    topSponsorCandidates: operational.topSponsorCandidates,
    dailyBriefing: operational.dailyBriefing,
    studioPulse,
  };
}
