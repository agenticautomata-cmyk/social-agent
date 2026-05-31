import {
  computePipelineDashboard,
  computePipelineReporting,
  type SponsorOpportunityWithContact,
} from '../sponsor-pipeline/opportunities.js';
import { OPEN_PIPELINE_STATUSES, PIPELINE_STATUS_LABELS } from '../sponsor-pipeline/constants.js';
import { listSponsorContacts } from '../sponsor-outreach/contacts.js';
import { computeBensonForecast } from './forecast.js';
import type { RevenueDashboardResponse, RevenueAtRiskItem } from './types.js';

const RISK_STALE_DAYS = 14;
const CONTACTED_STATUSES = new Set([
  'sent',
  'replied',
  'scheduled',
  'follow_up_needed',
  'converted',
]);

function startOfQuarterUtc(date: Date): Date {
  const q = Math.floor(date.getUTCMonth() / 3);
  return new Date(Date.UTC(date.getUTCFullYear(), q * 3, 1));
}

function endOfQuarterUtc(date: Date): Date {
  const start = startOfQuarterUtc(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1));
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function dealValue(opp: SponsorOpportunityWithContact): number {
  return opp.actualValue ?? opp.estimatedValue ?? 0;
}

export async function computeRevenueDashboard(options?: {
  now?: Date;
  demoMode?: boolean;
}): Promise<RevenueDashboardResponse> {
  const now = options?.now ?? new Date();
  const [dashboard, reporting, contacts] = await Promise.all([
    computePipelineDashboard(now),
    computePipelineReporting(),
    listSponsorContacts(),
  ]);

  const quarterStart = startOfQuarterUtc(now);
  const quarterEnd = endOfQuarterUtc(now);

  const wonQuarter = dashboard.opportunities
    .filter(
      (o) =>
        o.status === 'won' &&
        o.closedAt &&
        new Date(o.closedAt) >= quarterStart &&
        new Date(o.closedAt) < quarterEnd,
    )
    .reduce((s, o) => s + dealValue(o), 0);

  const openOpps = dashboard.opportunities.filter((o) =>
    OPEN_PIPELINE_STATUSES.includes(o.status),
  );

  const sponsorsContacted = contacts.filter(
    (c) =>
      CONTACTED_STATUSES.has(c.status) ||
      c.lastContactedAt != null,
  ).length;

  const sponsorsReplied = contacts.filter(
    (c) => c.status === 'replied' || c.status === 'converted',
  ).length;

  const meetingsScheduled = dashboard.opportunities.filter(
    (o) => o.status === 'meeting_scheduled',
  ).length;

  const proposalSentCount = dashboard.opportunities.filter(
    (o) => o.status === 'proposal_sent',
  ).length;

  const monthMap = new Map<string, { revenue: number; dealCount: number }>();
  for (const opp of dashboard.opportunities) {
    if (opp.status !== 'won' || !opp.closedAt) continue;
    const key = monthKey(opp.closedAt);
    const bucket = monthMap.get(key) ?? { revenue: 0, dealCount: 0 };
    bucket.revenue += dealValue(opp);
    bucket.dealCount += 1;
    monthMap.set(key, bucket);
  }

  const monthlyRevenueTrend = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, stats]) => ({
      month,
      label: monthLabel(month),
      revenue: Math.round(stats.revenue),
      dealCount: stats.dealCount,
    }));

  const pipelineByStage = dashboard.byStatus
    .filter((col) => OPEN_PIPELINE_STATUSES.includes(col.status) || col.count > 0)
    .map((col) => ({
      status: col.status,
      label: PIPELINE_STATUS_LABELS[col.status],
      count: col.count,
      value: col.value,
    }));

  const revenueByCategory = reporting.revenueByCategory.length > 0
    ? reporting.revenueByCategory
    : reporting.byCategory
        .filter((c) => c.wonValue > 0)
        .map((c) => ({
          category: c.category,
          revenue: c.wonValue,
          dealCount: c.count,
        }));

  const topOpportunities = [...openOpps]
    .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
    .slice(0, 10)
    .map((opp) => ({
      id: opp.id,
      sponsorContactId: opp.sponsorContactId,
      sponsor: opp.sponsorBusinessName,
      title: opp.title,
      stage: opp.status,
      stageLabel: PIPELINE_STATUS_LABELS[opp.status],
      estimatedValue: opp.estimatedValue,
      expectedCloseDate: opp.dueDate?.slice(0, 10) ?? null,
      href: `/sponsors/${opp.sponsorContactId}`,
    }));

  const riskCutoff = now.getTime() - RISK_STALE_DAYS * 24 * 60 * 60 * 1000;
  const revenueAtRisk: RevenueAtRiskItem[] = openOpps
    .filter((o) => new Date(o.updatedAt).getTime() < riskCutoff)
    .map((opp) => {
      const updated = new Date(opp.updatedAt);
      const daysSinceUpdate = Math.floor(
        (now.getTime() - updated.getTime()) / (24 * 60 * 60 * 1000),
      );
      return {
        id: opp.id,
        sponsor: opp.sponsorBusinessName,
        title: opp.title,
        stage: opp.status,
        stageLabel: PIPELINE_STATUS_LABELS[opp.status],
        estimatedValue: opp.estimatedValue,
        daysSinceUpdate,
        lastUpdatedAt: opp.updatedAt,
        href: `/pipeline`,
      };
    })
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  const forecast = computeBensonForecast({
    openOpportunities: openOpps,
    openPipelineValue: dashboard.totalPipelineValue,
    conversionRate: dashboard.conversionRate,
    averageDealSize: dashboard.averageDealSize,
    wonThisMonthValue: dashboard.wonThisMonth.value,
  });

  return {
    demoMode: options?.demoMode ?? false,
    generatedAt: dashboard.generatedAt,
    kpis: {
      pipelineValue: dashboard.totalPipelineValue,
      wonThisMonth: dashboard.wonThisMonth.value,
      wonThisQuarter: wonQuarter,
      averageDealSize: Math.round(dashboard.averageDealSize),
      openOpportunities: dashboard.openDealCount,
      sponsorsContacted,
      sponsorsReplied,
      meetingsScheduled,
      proposalSentCount,
    },
    charts: {
      pipelineByStage,
      revenueByCategory,
      monthlyRevenueTrend,
    },
    topOpportunities,
    forecast,
    revenueAtRisk,
    links: {
      sponsors: '/sponsors',
      pipeline: '/pipeline',
      outreach: '/outreach/queue',
      planner: '/planner',
    },
  };
}
