export const KELLIE_NAME = 'Kellie';

export const SPONSOR_CONTACT_STATUSES = [
  'lead',
  'ready_to_contact',
  'scheduled',
  'sent',
  'replied',
  'follow_up_needed',
  'not_interested',
  'converted',
] as const;

export type SponsorContactStatus = (typeof SPONSOR_CONTACT_STATUSES)[number];

export const OUTREACH_EMAIL_STATUSES = [
  'draft',
  'needs_approval',
  'scheduled',
  'sending',
  'sent',
  'simulated_sent',
  'failed',
  'canceled',
] as const;

export const OUTREACH_SEND_ATTEMPT_STATUSES = [
  'simulated',
  'sent',
  'failed',
  'canceled',
] as const;

export type OutreachSendAttemptStatus = (typeof OUTREACH_SEND_ATTEMPT_STATUSES)[number];

export type OutreachEmailStatus = (typeof OUTREACH_EMAIL_STATUSES)[number];

export const TEMPLATE_TYPES = [
  'introduction',
  'media_kit_send',
  'follow_up',
  'world_cup',
  'luxury_date_night',
  'restaurant_opening',
  'shopping_retail',
] as const;

export type TemplateType = (typeof TEMPLATE_TYPES)[number];
