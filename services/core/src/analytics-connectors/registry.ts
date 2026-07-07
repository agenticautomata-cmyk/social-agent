import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { analyticsConnectors, creatorPlatformConnections } from '../schema.js';
import { resolveDefaultTikTokCreatorAccountId } from '../tiktok-oauth/connections.js';
import {
  resolveDefaultFacebookAccountId,
  resolveDefaultInstagramAccountId,
  getMetaConnectionStatus,
} from '../meta-oauth/connections.js';
import { env } from '../env.js';
import {
  ANALYTICS_CONNECTOR_PROVIDERS,
  ANALYTICS_PROVIDER_LABELS,
  CREATOR_PLATFORM_TO_ANALYTICS,
  type AnalyticsConnectorProvider,
} from './constants.js';

export type AnalyticsConnectorRecord = {
  provider: AnalyticsConnectorProvider;
  label: string;
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncError: string | null;
  syncStatus: string;
  followers: number | null;
  postCount: number | null;
  totalViews: number | null;
  totalEngagement: number | null;
  enabled: boolean;
  updatedAt: string;
};

async function ensureConnectorRows(): Promise<void> {
  for (const provider of ANALYTICS_CONNECTOR_PROVIDERS) {
    await db
      .insert(analyticsConnectors)
      .values({ provider })
      .onConflictDoNothing();
  }
}

async function syncConnectionFlagsFromPlatform(): Promise<void> {
  const now = new Date();
  const tiktokAccountId = await resolveDefaultTikTokCreatorAccountId();
  const [igAccountId, fbAccountId] = await Promise.all([
    resolveDefaultInstagramAccountId(),
    resolveDefaultFacebookAccountId(),
  ]);

  const rows = await db
    .select()
    .from(creatorPlatformConnections)
    .where(eq(creatorPlatformConnections.creatorAccountId, tiktokAccountId));

  const igRows = await db
    .select()
    .from(creatorPlatformConnections)
    .where(eq(creatorPlatformConnections.creatorAccountId, igAccountId));

  const fbRows = await db
    .select()
    .from(creatorPlatformConnections)
    .where(eq(creatorPlatformConnections.creatorAccountId, fbAccountId));

  const allRows = [...rows, ...igRows, ...fbRows];

  for (const row of allRows) {
    if (!(row.platform in CREATOR_PLATFORM_TO_ANALYTICS)) continue;
    const provider = CREATOR_PLATFORM_TO_ANALYTICS[
      row.platform as keyof typeof CREATOR_PLATFORM_TO_ANALYTICS
    ]!;

    const connected = row.status === 'connected';
    await db
      .update(analyticsConnectors)
      .set({
        connected,
        accountId: row.platformUserId ?? row.platformUsername ?? null,
        accountName: row.platformUsername,
        updatedAt: now,
      })
      .where(eq(analyticsConnectors.provider, provider));
  }

  const meta = await getMetaConnectionStatus(env.DEMO_MODE);
  if (meta.facebook.status !== 'connected') {
    await db
      .update(analyticsConnectors)
      .set({ connected: false, updatedAt: now })
      .where(eq(analyticsConnectors.provider, 'facebook'));
  }
  if (meta.instagram.status !== 'connected') {
    await db
      .update(analyticsConnectors)
      .set({ connected: false, updatedAt: now })
      .where(eq(analyticsConnectors.provider, 'instagram'));
  }
}

function rowToRecord(row: typeof analyticsConnectors.$inferSelect): AnalyticsConnectorRecord {
  const provider = row.provider as AnalyticsConnectorProvider;
  return {
    provider,
    label: ANALYTICS_PROVIDER_LABELS[provider],
    connected: row.connected,
    accountId: row.accountId,
    accountName: row.accountName,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastSyncError: row.lastSyncError,
    syncStatus: row.syncStatus ?? 'idle',
    followers: row.followers ?? null,
    postCount: row.postCount ?? null,
    totalViews: row.totalViews ?? null,
    totalEngagement: row.totalEngagement ?? null,
    enabled: row.enabled ?? true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAnalyticsConnectors(): Promise<AnalyticsConnectorRecord[]> {
  await ensureConnectorRows();
  await syncConnectionFlagsFromPlatform();

  const rows = await db
    .select()
    .from(analyticsConnectors)
    .orderBy(analyticsConnectors.provider);

  return rows.map(rowToRecord);
}

export async function countConnectedAnalyticsConnectors(): Promise<number> {
  const connectors = await listAnalyticsConnectors();
  return connectors.filter((c) => c.connected).length;
}
