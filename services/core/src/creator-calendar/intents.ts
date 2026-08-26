export const CALENDAR_INTENTS = [
  'public_event',
  'content_filming',
  'content_posting',
  'sponsor_outreach',
  'creator_task',
  'early_signal',
  'personal_busy',
] as const;

export type CalendarIntent = (typeof CALENDAR_INTENTS)[number] | string;
