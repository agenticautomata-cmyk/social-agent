import { env } from '../env.js';
import {
  getDecryptedMetaToken,
  resolveDefaultFacebookAccountId,
  resolveDefaultInstagramAccountId,
  getMetaConnectionStatus,
} from '../meta-oauth/connections.js';
import { importVideoRows } from '../creator-analytics/import.js';
import type { ImportVideoRow } from '../creator-analytics/types.js';
import {
  markConnectorSyncError,
  setConnectorSyncing,
  updateConnectorMetrics,
} from '../analytics-connectors/state.js';
import { isConnectorEnabled } from '../analytics-connectors/settings.js';
import { syncProviderFromLocalData } from './demo.js';
import type { ProviderSyncResult } from './types.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

async function syncInstagramReadOnly(): Promise<ProviderSyncResult> {
  const provider = 'instagram' as const;
  if (!(await isConnectorEnabled(provider))) {
    return { provider, ok: true, skipped: true, reason: 'disabled_in_settings' };
  }
  const accountId = await resolveDefaultInstagramAccountId();
  const status = await getMetaConnectionStatus(env.DEMO_MODE);
  const igRow = status.instagram.connection;

  if (status.instagram.status !== 'connected' || !igRow?.platformUserId) {
    if (env.DEMO_MODE) {
      await setConnectorSyncing(provider);
      return syncProviderFromLocalData(provider);
    }
    return { provider, ok: true, skipped: true, reason: 'not_connected' };
  }

  const token =
    (await getDecryptedMetaToken(accountId, 'instagram')) ??
    (await getDecryptedMetaToken(await resolveDefaultFacebookAccountId(), 'facebook'));

  if (!token) {
    return { provider, ok: false, error: 'No Instagram access token' };
  }

  await setConnectorSyncing(provider);

  try {
    const igId = igRow.platformUserId;
    const mediaUrl = new URL(`${GRAPH}/${igId}/media`);
    mediaUrl.searchParams.set(
      'fields',
      'id,caption,permalink,timestamp,like_count,comments_count',
    );
    mediaUrl.searchParams.set('limit', '50');
    mediaUrl.searchParams.set('access_token', token);

    const mediaRes = await fetch(mediaUrl);
    const mediaJson = (await mediaRes.json()) as {
      data?: Array<{
        id: string;
        caption?: string;
        permalink?: string;
        timestamp?: string;
        like_count?: number;
        comments_count?: number;
      }>;
      error?: { message?: string };
    };

    if (!mediaRes.ok) {
      throw new Error(mediaJson.error?.message ?? `Instagram media fetch failed (${mediaRes.status})`);
    }

    const importRows: ImportVideoRow[] = (mediaJson.data ?? []).map((m) => ({
      video_id: m.id,
      caption: m.caption ?? null,
      post_url: m.permalink ?? null,
      published_at: m.timestamp ?? new Date().toISOString(),
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      views: 0,
      shares: 0,
    }));

    const result = await importVideoRows(importRows, {
      platform: 'instagram',
      username: igRow.platformUsername ?? 'kelliekc',
      source: 'api_display',
    });

    let followers: number | null = null;
    try {
      const insightsUrl = new URL(`${GRAPH}/${igId}/insights`);
      insightsUrl.searchParams.set('metric', 'follower_count');
      insightsUrl.searchParams.set('period', 'lifetime');
      insightsUrl.searchParams.set('access_token', token);
      const insRes = await fetch(insightsUrl);
      const insJson = (await insRes.json()) as {
        data?: Array<{ values?: Array<{ value?: number }> }>;
      };
      const val = insJson.data?.[0]?.values?.[0]?.value;
      if (typeof val === 'number') followers = val;
    } catch {
      // follower_count optional
    }

    const totalEngagement = importRows.reduce(
      (a, r) => a + (r.likes ?? 0) + (r.comments ?? 0),
      0,
    );

    await updateConnectorMetrics(provider, {
      connected: true,
      accountId: igId,
      accountName: igRow.platformUsername,
      postCount: importRows.length,
      totalViews: 0,
      totalEngagement,
      followers,
      markSuccess: true,
    });

    return { provider, ok: true, imported: result.imported, updated: result.updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Instagram sync failed';
    if (env.DEMO_MODE) {
      return syncProviderFromLocalData(provider);
    }
    await markConnectorSyncError(provider, message);
    return { provider, ok: false, error: message };
  }
}

async function syncFacebookReadOnly(): Promise<ProviderSyncResult> {
  const provider = 'facebook' as const;
  if (!(await isConnectorEnabled(provider))) {
    return { provider, ok: true, skipped: true, reason: 'disabled_in_settings' };
  }
  const accountId = await resolveDefaultFacebookAccountId();
  const status = await getMetaConnectionStatus(env.DEMO_MODE);
  const fbRow = status.facebook.connection;

  if (status.facebook.status !== 'connected' || !fbRow?.platformUserId) {
    if (env.DEMO_MODE) {
      await setConnectorSyncing(provider);
      return syncProviderFromLocalData(provider);
    }
    return { provider, ok: true, skipped: true, reason: 'not_connected' };
  }

  const token = await getDecryptedMetaToken(accountId, 'facebook');
  if (!token) {
    return { provider, ok: false, error: 'No Facebook Page access token' };
  }

  await setConnectorSyncing(provider);

  try {
    const pageId = fbRow.platformUserId;
    const insightsUrl = new URL(`${GRAPH}/${pageId}/insights`);
    insightsUrl.searchParams.set('metric', 'page_impressions,page_post_engagements,page_fans');
    insightsUrl.searchParams.set('period', 'day');
    insightsUrl.searchParams.set('access_token', token);

    const insRes = await fetch(insightsUrl);
    const insJson = (await insRes.json()) as {
      data?: Array<{ name: string; values?: Array<{ value?: number }> }>;
      error?: { message?: string };
    };

    if (!insRes.ok) {
      throw new Error(insJson.error?.message ?? `Facebook insights failed (${insRes.status})`);
    }

    const metric = (name: string) =>
      insJson.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0;

    const impressions = metric('page_impressions');
    const engagements = metric('page_post_engagements');
    const fans = metric('page_fans');

    await updateConnectorMetrics(provider, {
      connected: true,
      accountId: pageId,
      accountName: fbRow.platformUsername,
      followers: fans || null,
      postCount: null,
      totalViews: impressions,
      totalEngagement: engagements,
      markSuccess: true,
    });

    return { provider, ok: true, updated: 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Facebook sync failed';
    if (env.DEMO_MODE) {
      return syncProviderFromLocalData(provider);
    }
    await markConnectorSyncError(provider, message);
    return { provider, ok: false, error: message };
  }
}

export async function syncMetaAnalytics(): Promise<ProviderSyncResult[]> {
  return Promise.all([syncFacebookReadOnly(), syncInstagramReadOnly()]);
}
