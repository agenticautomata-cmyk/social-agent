import type {
  CalendarItemType,
  CalendarPlanningStatus,
  CalendarSyncStatus,
  ReminderSettings,
} from '@social-agent/core/creator-calendar';

export type {
  CalendarItemType,
  CalendarPlanningStatus,
  CalendarSyncStatus,
  ReminderSettings,
};

export type CalendarItemView = {
  id: string;
  title: string;
  description: string | null;
  itemType: CalendarItemType;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  sourceUrl: string | null;
  internalDetailUrl: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  timezone: string;
  location: string | null;
  status: CalendarPlanningStatus;
  planningStatus: CalendarPlanningStatus;
  creatorAction: string | null;
  reminderSettings: ReminderSettings;
  notes: string | null;
  calendarIntent: string | null;
  verificationState: string;
  whyIncluded: string | null;
  confidence: number | null;
  selected?: boolean;
  fallsInWeekend?: boolean;
  ticketUrl?: string | null;
  organizerUrl?: string | null;
  calendarCategory?: string | null;
  sync: {
    syncStatus: CalendarSyncStatus;
    googleEventId: string | null;
    autoUpdateEnabled: boolean;
    updateAvailable: boolean;
    lastSyncedAt: string | null;
    lastError: string | null;
  } | null;
  recommendedAction: string | null;
};

export const CALENDAR_DISMISS_REASONS = [
  'not_interested',
  'not_relevant',
  'too_far',
  'too_expensive',
  'bad_timing',
  'already_covered',
  'duplicate',
  'stale',
  'wrong_date',
  'other',
] as const;

export type CalendarDismissReason = (typeof CALENDAR_DISMISS_REASONS)[number];

export const CALENDAR_DISMISS_REASON_LABELS: Record<CalendarDismissReason, string> = {
  not_interested: 'Not interested',
  not_relevant: 'Not relevant',
  too_far: 'Too far',
  too_expensive: 'Too expensive',
  bad_timing: 'Bad timing',
  already_covered: 'Already covered',
  duplicate: 'Duplicate',
  stale: 'Stale',
  wrong_date: 'Wrong date',
  other: 'Other',
};

export const CALENDAR_VIEW_MODES = ['agenda', 'day', 'week', 'month'] as const;
export type CalendarViewMode = (typeof CALENDAR_VIEW_MODES)[number];

export const CALENDAR_FILTER_PRESETS = {
  filming: ['content_filming'] as CalendarItemType[],
  posting: ['content_posting'] as CalendarItemType[],
  publicEvents: ['public_event'] as CalendarItemType[],
  sponsorDeadlines: ['sponsor_outreach'] as CalendarItemType[],
  earlySignals: ['early_signal'] as CalendarItemType[],
} as const;

export const ITEM_TYPE_LABELS: Record<CalendarItemType, string> = {
  public_event: 'Public event',
  content_filming: 'Filming',
  content_posting: 'Posting',
  sponsor_outreach: 'Sponsor',
  creator_task: 'Task',
  early_signal: 'Early signal',
  personal_busy: 'Busy',
};

export type CalendarCategorySnoozeView = {
  category: string;
  label: string;
  until: string | null;
  untilLabel: string;
};

export const ITEM_TYPE_ICONS: Record<CalendarItemType, string> = {
  public_event: '🎪',
  content_filming: '🎬',
  content_posting: '📱',
  sponsor_outreach: '🤝',
  creator_task: '✅',
  early_signal: '📡',
  personal_busy: '🔒',
};
