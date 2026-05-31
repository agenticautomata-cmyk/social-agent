import { computeActionCenter } from '../action-center/hub.js';
import { computePipelineDashboard } from '../sponsor-pipeline/opportunities.js';
import { getOutreachSendConfig } from '../sponsor-outreach/send.js';
import { computePreAlphaStatus } from './status.js';

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
};

export async function computePreAlphaHome(options?: {
  now?: Date;
  demoMode?: boolean;
}): Promise<PreAlphaHomeResponse> {
  const now = options?.now ?? new Date();
  const [status, actions, pipeline] = await Promise.all([
    computePreAlphaStatus(),
    computeActionCenter({ now, demoMode: options?.demoMode }),
    computePipelineDashboard(now),
  ]);

  const outreach = getOutreachSendConfig();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning, Kellie' : hour < 17 ? 'Good afternoon, Kellie' : 'Good evening, Kellie';

  const quickLinks: HomeQuickLink[] = [
    { href: '/editor', label: 'Today', description: 'Daily briefing and post picks' },
    { href: '/actions', label: 'Actions', description: 'Follow-ups, approvals, and one-click tasks' },
    { href: '/planner', label: 'Planner', description: 'Weekly content plan and shortlist' },
    { href: '/sponsor-intelligence', label: 'Sponsor intel', description: 'Who to contact first' },
    { href: '/sponsors', label: 'Sponsors', description: 'CRM contacts and notes' },
    { href: '/pipeline', label: 'Pipeline', description: 'Deal stages and values' },
    { href: '/outreach/queue', label: 'Outreach', description: 'Email queue (simulated send)' },
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

  return {
    demoMode: options?.demoMode ?? status.demoMode,
    generatedAt: now.toISOString(),
    greeting,
    subline: 'Your Benson home base — start here for daily testing.',
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
  };
}
