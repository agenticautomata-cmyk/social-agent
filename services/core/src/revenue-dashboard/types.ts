import type { SponsorPipelineStatus } from '../sponsor-pipeline/constants.js';

export type RevenueKpis = {
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

export type PipelineStageChart = {
  status: SponsorPipelineStatus;
  label: string;
  count: number;
  value: number;
};

export type CategoryRevenueChart = {
  category: string;
  revenue: number;
  dealCount: number;
};

export type MonthlyRevenuePoint = {
  month: string;
  label: string;
  revenue: number;
  dealCount: number;
};

export type TopOpportunityRow = {
  id: string;
  sponsorContactId: string;
  sponsor: string;
  title: string;
  stage: SponsorPipelineStatus;
  stageLabel: string;
  estimatedValue: number | null;
  expectedCloseDate: string | null;
  href: string;
};

export type BensonForecast = {
  conservative: number;
  expected: number;
  optimistic: number;
  conversionRateUsed: number;
  openPipelineValue: number;
  methodology: string;
};

export type RevenueAtRiskItem = {
  id: string;
  sponsor: string;
  title: string;
  stage: SponsorPipelineStatus;
  stageLabel: string;
  estimatedValue: number | null;
  daysSinceUpdate: number;
  lastUpdatedAt: string;
  href: string;
};

export type RevenueDashboardLinks = {
  sponsors: string;
  pipeline: string;
  outreach: string;
  planner: string;
};

export type RevenueDashboardResponse = {
  demoMode: boolean;
  generatedAt: string;
  kpis: RevenueKpis;
  charts: {
    pipelineByStage: PipelineStageChart[];
    revenueByCategory: CategoryRevenueChart[];
    monthlyRevenueTrend: MonthlyRevenuePoint[];
  };
  topOpportunities: TopOpportunityRow[];
  forecast: BensonForecast;
  revenueAtRisk: RevenueAtRiskItem[];
  links: RevenueDashboardLinks;
};
