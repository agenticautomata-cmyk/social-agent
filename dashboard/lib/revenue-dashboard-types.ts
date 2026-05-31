import type { SponsorPipelineStatus } from './sponsor-pipeline-types';

export type RevenueDashboardResponse = {
  demoMode: boolean;
  generatedAt: string;
  kpis: {
    pipelineValue: number;
    wonThisMonth: number;
    wonThisQuarter: number;
    averageDealSize: number;
    openOpportunities: number;
    sponsorsContacted: number;
    sponsorsReplied: number;
    meetingsScheduled: number;
    proposalSentCount: number;
  };
  charts: {
    pipelineByStage: Array<{
      status: SponsorPipelineStatus;
      label: string;
      count: number;
      value: number;
    }>;
    revenueByCategory: Array<{ category: string; revenue: number; dealCount: number }>;
    monthlyRevenueTrend: Array<{
      month: string;
      label: string;
      revenue: number;
      dealCount: number;
    }>;
  };
  topOpportunities: Array<{
    id: string;
    sponsorContactId: string;
    sponsor: string;
    title: string;
    stage: SponsorPipelineStatus;
    stageLabel: string;
    estimatedValue: number | null;
    expectedCloseDate: string | null;
    href: string;
  }>;
  forecast: {
    conservative: number;
    expected: number;
    optimistic: number;
    conversionRateUsed: number;
    openPipelineValue: number;
    methodology: string;
  };
  revenueAtRisk: Array<{
    id: string;
    sponsor: string;
    title: string;
    stage: SponsorPipelineStatus;
    stageLabel: string;
    estimatedValue: number | null;
    daysSinceUpdate: number;
    lastUpdatedAt: string;
    href: string;
  }>;
  links: {
    sponsors: string;
    pipeline: string;
    outreach: string;
    planner: string;
  };
};
