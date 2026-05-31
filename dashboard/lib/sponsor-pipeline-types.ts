export type SponsorPipelineStatus =
  | 'lead'
  | 'contacted'
  | 'interested'
  | 'meeting_scheduled'
  | 'proposal_sent'
  | 'negotiating'
  | 'won'
  | 'lost';

export type SponsorOpportunityRecord = {
  id: string;
  sponsorContactId: string;
  title: string;
  estimatedValue: number | null;
  actualValue: number | null;
  status: SponsorPipelineStatus;
  notes: string | null;
  leadSource: string | null;
  plannerListName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  sponsorBusinessName?: string;
  sponsorCategory?: string | null;
};

export type SponsorPipelineSummary = {
  openOpportunities: SponsorOpportunityRecord[];
  openPipelineValue: number;
  closedValue: number;
  wonCount: number;
  lostCount: number;
};

export type PipelineDashboard = {
  generatedAt: string;
  totalPipelineValue: number;
  openDealCount: number;
  wonThisMonth: { count: number; value: number };
  lostThisMonth: { count: number };
  conversionRate: number;
  averageDealSize: number;
  byStatus: Array<{ status: SponsorPipelineStatus; count: number; value: number }>;
  opportunities: SponsorOpportunityRecord[];
  demoMode?: boolean;
};

export type PipelineReporting = {
  byLeadSource: Array<{
    source: string;
    count: number;
    won: number;
    lost: number;
    closeRate: number;
  }>;
  byCategory: Array<{
    category: string;
    count: number;
    openValue: number;
    wonValue: number;
    closeRate: number;
  }>;
  revenueByCategory: Array<{ category: string; revenue: number; dealCount: number }>;
};

export const PIPELINE_STATUS_LABELS: Record<SponsorPipelineStatus, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  interested: 'Interested',
  meeting_scheduled: 'Meeting Scheduled',
  proposal_sent: 'Proposal Sent',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function pipelineStatusLabel(status: string): string {
  return PIPELINE_STATUS_LABELS[status as SponsorPipelineStatus] ?? status.replace(/_/g, ' ');
}
