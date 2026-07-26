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

export const ITEM_TYPE_ICONS: Record<CalendarItemType, string> = {
  public_event: '🎪',
  content_filming: '🎬',
  content_posting: '📱',
  sponsor_outreach: '🤝',
  creator_task: '✅',
  early_signal: '📡',
  personal_busy: '🔒',
};
