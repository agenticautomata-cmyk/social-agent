export const DATA_REVISION_DOMAINS = [
  'analytics',
  'discoveries',
  'early_signals',
  'scout',
  'calendar',
  'opportunities',
  'sponsors',
  'email',
  'worker_health',
  'recommendations',
  'home_briefing',
  'voice',
] as const;

export type DataRevisionDomain = (typeof DATA_REVISION_DOMAINS)[number];

export type DataChangeEventType =
  | 'analytics_sync'
  | 'analytics_import'
  | 'analytics_reconnect'
  | 'gmail_sync'
  | 'source_refresh'
  | 'early_signal_ingestion'
  | 'source_watcher_complete'
  | 'analytics_recalculation'
  | 'opportunity_enrichment'
  | 'pitch_status_change'
  | 'worker_recovery'
  | 'suppression_change'
  | 'dismissal'
  | 'skip'
  | 'planning_action'
  | 'content_lifecycle'
  | 'manual_update'
  | 'calendar_change'
  | 'google_calendar_sync'
  | 'database_cleanup'
  | 'pulse_brief_generated'
  | 'learning_cycle';

export type DataChangeEvent = {
  eventType: DataChangeEventType;
  domains: DataRevisionDomain[];
  completedAt: string;
  source: string;
  recordIds?: string[];
  success: boolean;
  metadata?: Record<string, unknown>;
};

export type DomainRevisionStatus = {
  domain: DataRevisionDomain;
  revision: number;
  updatedAt: string;
  lastEventType: string | null;
  lastSource: string | null;
  lastSuccess: boolean;
  recalculating?: boolean;
  recalculatingMessage?: string;
};

export type DataRevisionStatusResponse = {
  revisions: Record<DataRevisionDomain, DomainRevisionStatus>;
  globalRevision: number;
  serverTime: string;
};

/** Domains that should trigger Home dashboard refetch. */
export const HOME_REFRESH_DOMAINS: DataRevisionDomain[] = [
  'analytics',
  'home_briefing',
  'recommendations',
  'opportunities',
  'discoveries',
  'email',
  'worker_health',
];

/** Domains that should trigger Benson Pulse card refetch. */
export const PULSE_REFRESH_DOMAINS: DataRevisionDomain[] = [
  'analytics',
  'recommendations',
  'home_briefing',
  'discoveries',
];
