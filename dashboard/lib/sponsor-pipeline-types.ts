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

/** Kellie workflow labels (maps to existing DB statuses). */
export const WORKFLOW_PIPELINE_LABELS: Record<SponsorPipelineStatus, string> = {
  lead: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  meeting_scheduled: 'Meeting Scheduled',
  proposal_sent: 'Proposal Sent',
  negotiating: 'Negotiating',
  won: 'Closed',
  lost: 'Rejected',
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

export const RELATIONSHIP_STAGES = [
  'researching',
  'draft_ready',
  'contacted',
  'replied',
  'qualified',
  'negotiating',
  'won',
  'declined',
] as const;
export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

export const RELATIONSHIP_STAGE_LABEL: Record<RelationshipStage, string> = {
  researching: 'Researching',
  draft_ready: 'Draft ready',
  contacted: 'Contacted',
  replied: 'Replied',
  qualified: 'Qualified',
  negotiating: 'Negotiating',
  won: 'Won',
  declined: 'Declined',
};

export type PipelineRelationshipCard = {
  sponsorContactId: string;
  businessName: string;
  contactName: string | null;
  contactChannel: string | null;
  category: string | null;
  contactStatus: string;
  contactVerificationStatus: string;
  stage: RelationshipStage;
  lastActivity: string | null;
  nextFollowUpAt: string | null;
  dealId: string | null;
  dealTitle: string | null;
  estimatedValue: number | null;
  actualValue: number | null;
  closedAt: string | null;
  hasFormalDeal: boolean;
};

export function pipelineStatusLabel(status: string): string {
  return (
    WORKFLOW_PIPELINE_LABELS[status as SponsorPipelineStatus] ??
    PIPELINE_STATUS_LABELS[status as SponsorPipelineStatus] ??
    status.replace(/_/g, ' ')
  );
}
