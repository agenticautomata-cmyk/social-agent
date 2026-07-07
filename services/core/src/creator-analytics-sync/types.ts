import type { AnalyticsConnectorProvider } from '../analytics-connectors/constants.js';

export type SyncTrigger = 'manual' | 'scheduled';

export type ProviderSyncResult = {
  provider: AnalyticsConnectorProvider;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  imported?: number;
  updated?: number;
  error?: string;
};

export type AnalyticsSyncRunResult = {
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt: string;
  results: ProviderSyncResult[];
};

export type AnalyticsSyncStatus = {
  inProgress: boolean;
  lastRunAt: string | null;
  lastTrigger: SyncTrigger | null;
  connectors: Array<{
    provider: AnalyticsConnectorProvider;
    syncStatus: string;
    lastSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    lastSyncError: string | null;
  }>;
};
