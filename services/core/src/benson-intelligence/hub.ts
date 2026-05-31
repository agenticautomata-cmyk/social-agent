import type { InventoryItem } from '../inventory/normalize.js';
import { computeCommandCenter } from '../inventory/command-center.js';
import { computePipelineDashboard } from '../sponsor-pipeline/opportunities.js';
import { listOutreachEmails } from '../sponsor-outreach/outreach.js';
import { listSponsorContacts } from '../sponsor-outreach/contacts.js';
import { loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import { buildBensonContext } from './context.js';
import { computeBriefingPriorities } from './briefing.js';
import type { BensonHubResponse } from './types.js';

function formatMoney(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 100) / 10}k`;
  return `$${Math.round(n)}`;
}

export async function computeBensonHub(
  items: InventoryItem[],
  options?: { now?: Date; demoMode?: boolean },
): Promise<BensonHubResponse> {
  const now = options?.now ?? new Date();
  const context = await buildBensonContext();
  const briefing = computeCommandCenter(items, { now, limit: 4 });
  const priorities = computeBriefingPriorities(briefing, context, items);

  const [pipelineDash, outreachQueue, contacts, analyticsLoad] = await Promise.all([
    computePipelineDashboard(),
    listOutreachEmails('queue'),
    listSponsorContacts(),
    loadVideosWithLatestMetrics('tiktok'),
  ]);

  const needsApproval = outreachQueue.filter((e) => e.status === 'needs_approval').length;
  const scheduled = outreachQueue.filter((e) => e.status === 'scheduled').length;

  const topCategories = [...context.categoryAnalytics.values()]
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 3);

  const analyticsHighlights =
    analyticsLoad.videos.length === 0
      ? ['Import TikTok analytics to unlock performance-aware recommendations.']
      : [
          `${analyticsLoad.videos.length} videos in analytics baseline.`,
          ...topCategories.map(
            (c) =>
              `${c.category.replace(/_/g, ' ')}: ~${c.avgViews.toLocaleString()} avg views (${c.sampleSize} posts)`,
          ),
        ];

  const postTodayCount = briefing.sections.postToday.items.length;
  const trendingCount = briefing.sections.trending.items.length;

  return {
    demoMode: options?.demoMode ?? false,
    generatedAt: new Date().toISOString(),
    briefingPriorities: priorities,
    sections: {
      content: {
        headline: 'Content',
        summary: `${postTodayCount} post-today picks · ${trendingCount} trending signals`,
        metrics: [
          { label: 'discovered today', value: briefing.sections.discoveredToday.items.length },
          { label: 'highest confidence', value: briefing.sections.highestConfidence.items.length },
          { label: 'follow-ups due', value: briefing.sections.followUpsDue.items.length },
        ],
        highlights: briefing.sections.postToday.items
          .slice(0, 3)
          .map((i) => i.title),
        href: '/editor',
      },
      sponsors: {
        headline: 'Sponsors',
        summary: `${contacts.length} CRM contacts · ${context.pipelineOpportunities.length} open deals`,
        metrics: [
          { label: 'contacts', value: contacts.length },
          { label: 'sponsor-ready picks', value: briefing.sections.contactBusinesses.items.length },
        ],
        highlights: briefing.sections.contactBusinesses.items
          .slice(0, 3)
          .map((i) => i.title),
        href: '/sponsors',
      },
      pipeline: {
        headline: 'Pipeline',
        summary: `${formatMoney(pipelineDash.totalPipelineValue)} open pipeline`,
        metrics: [
          { label: 'open deals', value: pipelineDash.openDealCount },
          {
            label: 'negotiating',
            value: pipelineDash.byStatus.find((s) => s.status === 'negotiating')?.count ?? 0,
          },
          {
            label: 'proposal sent',
            value: pipelineDash.byStatus.find((s) => s.status === 'proposal_sent')?.count ?? 0,
          },
        ],
        highlights: context.pipelineOpportunities
          .filter((o) => o.status === 'negotiating' || o.status === 'proposal_sent')
          .slice(0, 3)
          .map((o) => `${o.sponsorBusinessName} — ${o.title}`),
        href: '/pipeline',
      },
      analytics: {
        headline: 'Analytics',
        summary:
          analyticsLoad.videos.length > 0
            ? 'Performance signals feeding Benson scores'
            : 'Connect or import analytics for smarter picks',
        metrics: [
          { label: 'videos tracked', value: analyticsLoad.videos.length },
          { label: 'categories', value: context.categoryAnalytics.size },
        ],
        highlights: analyticsHighlights,
        href: '/analytics',
      },
      outreach: {
        headline: 'Outreach',
        summary: `${needsApproval} awaiting approval · ${scheduled} scheduled`,
        metrics: [
          { label: 'needs approval', value: needsApproval },
          { label: 'in queue', value: outreachQueue.length },
          { label: 'drafts', value: outreachQueue.filter((e) => e.status === 'draft').length },
        ],
        highlights: context.outreachNeedsApproval
          .slice(0, 3)
          .map((e) => e.subject || 'Outreach email'),
        href: '/outreach/queue',
      },
    },
  };
}
