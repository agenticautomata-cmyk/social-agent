import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { analyticsConnectors } from '../schema.js';
import type { AnalyticsConnectorProvider } from './constants.js';

export type ConnectorSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export type ConnectorMetricsUpdate = {
  connected?: boolean;
  accountId?: string | null;
  accountName?: string | null;
  followers?: number | null;
  postCount?: number | null;
  totalViews?: number | null;
  totalEngagement?: number | null;
  syncStatus?: ConnectorSyncStatus;
  lastSyncError?: string | null;
  markSuccess?: boolean;
};

export async function setConnectorSyncing(provider: AnalyticsConnectorProvider): Promise<void> {
  const now = new Date();
  await db
    .update(analyticsConnectors)
    .set({
      syncStatus: 'syncing',
      lastSyncAt: now,
      lastSyncError: null,
      updatedAt: now,
    })
    .where(eq(analyticsConnectors.provider, provider));
}

export async function updateConnectorMetrics(
  provider: AnalyticsConnectorProvider,
  update: ConnectorMetricsUpdate,
): Promise<void> {
  const now = new Date();
  const patch: Partial<typeof analyticsConnectors.$inferInsert> = { updatedAt: now };

  if (update.connected !== undefined) patch.connected = update.connected;
  if (update.accountId !== undefined) patch.accountId = update.accountId;
  if (update.accountName !== undefined) patch.accountName = update.accountName;
  if (update.followers !== undefined) patch.followers = update.followers;
  if (update.postCount !== undefined) patch.postCount = update.postCount;
  if (update.totalViews !== undefined) patch.totalViews = update.totalViews;
  if (update.totalEngagement !== undefined) patch.totalEngagement = update.totalEngagement;
  if (update.syncStatus !== undefined) patch.syncStatus = update.syncStatus;
  if (update.lastSyncError !== undefined) patch.lastSyncError = update.lastSyncError;

  patch.lastSyncAt = now;
  if (update.markSuccess) {
    patch.lastSuccessfulSyncAt = now;
    patch.syncStatus = 'success';
    patch.lastSyncError = null;
  }

  await db
    .update(analyticsConnectors)
    .set(patch)
    .where(eq(analyticsConnectors.provider, provider));
}

export async function markConnectorSyncError(
  provider: AnalyticsConnectorProvider,
  message: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(analyticsConnectors)
    .set({
      syncStatus: 'error',
      lastSyncError: message,
      lastSyncAt: now,
      updatedAt: now,
    })
    .where(eq(analyticsConnectors.provider, provider));
}
