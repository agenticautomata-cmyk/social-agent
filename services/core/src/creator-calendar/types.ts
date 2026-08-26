export const CALENDAR_ITEM_TYPES = [
  'public_event',
  'content_filming',
  'content_posting',
  'sponsor_outreach',
  'creator_task',
  'early_signal',
  'personal_busy',
] as const;

export type CalendarItemType = (typeof CALENDAR_ITEM_TYPES)[number];

export const CALENDAR_PLANNING_STATUSES = [
  'suggested',
  'tentative',
  'confirmed',
  'completed',
  'missed',
  'cancelled',
  'expired',
  'dismissed',
] as const;

export type CalendarPlanningStatus = (typeof CALENDAR_PLANNING_STATUSES)[number];

export const CALENDAR_SYNC_STATUSES = [
  'benson_only',
  'ready_to_export',
  'syncing',
  'synced',
  'update_available',
  'sync_failed',
  'google_auth_required',
  'removed_from_google',
] as const;

export type CalendarSyncStatus = (typeof CALENDAR_SYNC_STATUSES)[number];

export const CREATOR_ACTIONS = [
  'attend',
  'film',
  'post',
  'follow_up',
  'research',
  'reminder_only',
  'custom',
] as const;

export type CreatorAction = (typeof CREATOR_ACTIONS)[number];

export const DEFAULT_CALENDAR_TIMEZONE = 'America/Chicago';

export const CALENDAR_ITEM_TYPE_LABELS: Record<CalendarItemType, string> = {
  public_event: 'Public event',
  content_filming: 'Content filming',
  content_posting: 'Content posting',
  sponsor_outreach: 'Sponsor outreach',
  creator_task: 'Creator task',
  early_signal: 'Early signal',
  personal_busy: 'Busy block',
};

export const CALENDAR_ITEM_TYPE_ICONS: Record<CalendarItemType, string> = {
  public_event: '🎪',
  content_filming: '🎬',
  content_posting: '📱',
  sponsor_outreach: '🤝',
  creator_task: '✅',
  early_signal: '📡',
  personal_busy: '🔒',
};

export type ReminderSettings = {
  preset?: 'at_time' | '30m' | '1h' | '1d' | 'custom';
  minutesBefore?: number;
  googleReminderMinutes?: number;
  travelReminder?: boolean;
  equipmentReminder?: boolean;
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
  latitude: string | null;
  longitude: string | null;
  status: CalendarPlanningStatus;
  planningStatus: CalendarPlanningStatus;
  creatorAction: string | null;
  reminderSettings: ReminderSettings;
  contentFormat: string | null;
  verifiedFields: string[];
  unverifiedFields: string[];
  notes: string | null;
  travelMinutes: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  missedAt: string | null;
  expiredAt: string | null;
  calendarIntent: string | null;
  verificationState: string;
  whyIncluded: string | null;
  confidence: number | null;
  selected: boolean;
  fallsInWeekend: boolean;
  ticketUrl: string | null;
  organizerUrl: string | null;
  calendarCategory: string | null;
  sync: CalendarSyncView | null;
  recommendedAction: string | null;
};

export type CalendarSyncView = {
  syncStatus: CalendarSyncStatus;
  googleCalendarId: string | null;
  googleEventId: string | null;
  autoUpdateEnabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  updateAvailable: boolean;
};

export type CreateCalendarItemInput = {
  title: string;
  description?: string | null;
  itemType: CalendarItemType;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  internalDetailUrl?: string | null;
  startAt: Date | string;
  endAt?: Date | string | null;
  allDay?: boolean;
  timezone?: string;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  planningStatus?: CalendarPlanningStatus;
  creatorAction?: CreatorAction | string | null;
  reminderSettings?: ReminderSettings;
  contentFormat?: string | null;
  verifiedFields?: string[];
  unverifiedFields?: string[];
  notes?: string | null;
  travelMinutes?: number | null;
  createdBy?: string;
};

export type UpdateCalendarItemInput = Partial<
  Omit<CreateCalendarItemInput, 'sourceRecordType' | 'sourceRecordId'>
> & {
  planningStatus?: CalendarPlanningStatus;
  status?: CalendarPlanningStatus;
};

export type CalendarListFilters = {
  from?: Date | string;
  to?: Date | string;
  itemTypes?: CalendarItemType[];
  planningStatuses?: CalendarPlanningStatus[];
  syncStatuses?: CalendarSyncStatus[];
  googleSynced?: boolean;
  bensonOnly?: boolean;
  includeCompleted?: boolean;
  includeExpired?: boolean;
  includeDismissed?: boolean;
  includeCancelled?: boolean;
  sourceRecordType?: string;
  sourceRecordId?: string;
};

export type GoogleExportConfirmInput = {
  autoUpdateEnabled?: boolean;
  googleReminderMinutes?: number;
  destinationCalendarId?: string;
};
