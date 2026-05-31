export const SPONSOR_PIPELINE_STATUSES = [
  'lead',
  'contacted',
  'interested',
  'meeting_scheduled',
  'proposal_sent',
  'negotiating',
  'won',
  'lost',
] as const;

export type SponsorPipelineStatus = (typeof SPONSOR_PIPELINE_STATUSES)[number];

export const OPEN_PIPELINE_STATUSES: SponsorPipelineStatus[] = [
  'lead',
  'contacted',
  'interested',
  'meeting_scheduled',
  'proposal_sent',
  'negotiating',
];

export const CLOSED_PIPELINE_STATUSES: SponsorPipelineStatus[] = ['won', 'lost'];

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
