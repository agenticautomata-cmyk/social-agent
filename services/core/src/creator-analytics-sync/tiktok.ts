import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorMetricsSnapshots, creatorPlatformConnections, creatorVideos } from '../schema.js';
import { env } from '../env.js';
import {
  getDecryptedAccessToken,
  getTikTokConnectionRow,
  resolveActiveTikTokCreatorAccountId,
  getActiveTikTokConnectionRow,
  alignTikTokConnectionToAccount,
} from '../tiktok-oauth/connections.js';
import { refreshTikTokConnection } from '../tiktok-oauth/oauth.js';
import { getOrCreateAccount, importVideoRows } from '../creator-analytics/import.js';
import { classifyTikTokVideos } from '../creator-analytics/classify-videos.js';
import { refreshPostingTimeAnalytics } from '../creator-analytics/posting-times.js';
import { clearStaleTikTokFollowers } from '../creator-analytics/tiktok-context.js';
import type { ImportVideoRow } from '../creator-analytics/types.js';
import {
  markConnectorSyncError,
  setConnectorSyncing,
  updateConnectorMetrics,
} from '../analytics-connectors/state.js';
import { syncProviderFromLocalData } from './demo.js';
import type { ProviderSyncResult } from './types.js';

const VIDEO_LIST_FIELDS =
  'id,title,video_description,create_time,share_url,cover_image_url';
const VIDEO_LIST_URL = `https://open.tiktokapis.com/v2/video/list/?fields=${VIDEO_LIST_FIELDS}`;
const VIDEO_QUERY_URL = 'https://open.tiktokapis.com/v2/video/query/';
const USER_INFO_URL =
  'https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name,follower_count';

type TikTokListResponse = {
  data?: {
    videos?: Array<{
      id: string;
      title?: string;
      video_description?: string;
      create_time?: number;
      share_url?: string;
      cover_image_url?: string;
    }>;
    cursor?: number;
    has_more?: boolean;
  };
  error?: { message?: string; code?: string };
};

function tikTokApiError(json: { error?: { code?: string; message?: string } }, status: number): string | null {
  const code = json.error?.code;
  if (code && code !== 'ok') {
    return json.error?.message || code;
  }
  if (status >= 400) {
    return json.error?.message || `HTTP ${status}`;
  }
  return null;
}

type TikTokQueryResponse = {
  data?: {
    videos?: Array<{
      id: string;
      view_count?: number;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
    }>;
  };
  error?: { message?: string; code?: string };
};

function usernameFromShareUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/tiktok\.com\/@([^/?]+)/i);
  return match?.[1] ?? null;
}

async function fetchTikTokUserProfile(token: string): Promise<{
  username: string | null;
  displayName: string | null;
  followerCount: number | null;
}> {
  const res = await fetch(USER_INFO_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    data?: { user?: { username?: string; display_name?: string; follower_count?: number } };
    error?: { code?: string; message?: string };
  };
  const err = tikTokApiError(json, res.status);
  if (err && !json.data?.user) {
    return { username: null, displayName: null, followerCount: null };
  }
  const user = json.data?.user;
  return {
    username: user?.username ?? null,
    displayName: user?.display_name ?? null,
    followerCount:
      typeof user?.follower_count === 'number' && user.follower_count >= 0
        ? user.follower_count
        : null,
  };
}

/** Remove erroneous api_display snapshots that zeroed views when TikTok video.query omitted a video. */
async function repairZeroedApiSnapshots(accountId: string): Promise<number> {
  const videos = await db
    .select({ id: creatorVideos.id })
    .from(creatorVideos)
    .where(eq(creatorVideos.accountId, accountId));

  let repaired = 0;
  for (const video of videos) {
    const snaps = await db
      .select()
      .from(creatorMetricsSnapshots)
      .where(eq(creatorMetricsSnapshots.videoId, video.id))
      .orderBy(desc(creatorMetricsSnapshots.collectedAt))
      .limit(2);
    if (snaps.length < 2) continue;
    const latest = snaps[0]!;
    const previous = snaps[1]!;
    if (
      latest.source === 'api_display' &&
      (latest.views ?? 0) === 0 &&
      (previous.views ?? 0) > 0
    ) {
      await db.delete(creatorMetricsSnapshots).where(eq(creatorMetricsSnapshots.id, latest.id));
      repaired++;
    }
  }
  return repaired;
}

async function loadExistingTikTokVideoIds(
  accountId: string,
  tiktokVideoIds: string[],
): Promise<Set<string>> {
  if (tiktokVideoIds.length === 0) return new Set();
  const rows = await db
    .select({ videoId: creatorVideos.videoId })
    .from(creatorVideos)
    .where(
      and(eq(creatorVideos.accountId, accountId), inArray(creatorVideos.videoId, tiktokVideoIds)),
    );
  return new Set(rows.map((r) => r.videoId));
}

async function purgeDemoSeedVideos(platformUsername: string): Promise<number> {
  const accountId = await getOrCreateAccount('tiktok', platformUsername);
  const demos = await db
    .select({ id: creatorVideos.id })
    .from(creatorVideos)
    .where(
      and(eq(creatorVideos.accountId, accountId), like(creatorVideos.videoId, 'demo_tt_%')),
    );

  for (const demo of demos) {
    await db
      .delete(creatorMetricsSnapshots)
      .where(eq(creatorMetricsSnapshots.videoId, demo.id));
    await db.delete(creatorVideos).where(eq(creatorVideos.id, demo.id));
  }

  return demos.length;
}

export async function syncTikTokAnalytics(): Promise<ProviderSyncResult> {
  const provider = 'tiktok' as const;
  const row = await getActiveTikTokConnectionRow();
  const connected = Boolean(row && row.status === 'connected');

  if (!connected) {
    if (env.DEMO_MODE) {
      await setConnectorSyncing(provider);
      return syncProviderFromLocalData(provider);
    }
    return { provider, ok: true, skipped: true, reason: 'not_connected' };
  }

  const needsRefresh =
    row!.expiresAt != null && row!.expiresAt.getTime() < Date.now() + 60 * 60 * 1000;
  if (needsRefresh) {
    const refreshed = await refreshTikTokConnection(row!.creatorAccountId);
    if (!refreshed.ok) {
      console.warn('[tiktok-sync] token refresh failed:', refreshed.error);
      return { provider, ok: false, error: refreshed.error };
    }
  }

  const token = await getDecryptedAccessToken(row!.creatorAccountId);
  if (!token) {
    return { provider, ok: false, error: 'No TikTok access token' };
  }

  await setConnectorSyncing(provider);

  try {
    const allVideos: NonNullable<TikTokListResponse['data']>['videos'] = [];
    let cursor: number | undefined;
    let hasMore = true;

    while (hasMore && allVideos.length < 200) {
      const listRes = await fetch(VIDEO_LIST_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_count: 20,
          ...(cursor != null ? { cursor } : {}),
        }),
      });
      const listJson = (await listRes.json()) as TikTokListResponse;
      const listErr = tikTokApiError(listJson, listRes.status);
      if (listErr) {
        throw new Error(listErr);
      }
      const batch = listJson.data?.videos ?? [];
      allVideos.push(...batch);
      cursor = listJson.data?.cursor;
      hasMore = Boolean(listJson.data?.has_more);
      if (batch.length === 0) break;
    }

    const ids = allVideos.map((v) => v.id).filter(Boolean);
    const metricsById = new Map<
      string,
      NonNullable<NonNullable<TikTokQueryResponse['data']>['videos']>[number]
    >();

    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      const queryRes = await fetch(
        `${VIDEO_QUERY_URL}?fields=id,view_count,like_count,comment_count,share_count`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filters: { video_ids: chunk } }),
        },
      );
      const queryJson = (await queryRes.json()) as TikTokQueryResponse;
      const queryErr = tikTokApiError(queryJson, queryRes.status);
      if (queryErr) {
        console.warn('[tiktok-sync] video.query partial:', queryErr);
        continue;
      }
      for (const v of queryJson.data?.videos ?? []) {
        metricsById.set(v.id, v);
      }
    }

    const username = row!.platformUsername ?? 'kelliekc';
    const profile = await fetchTikTokUserProfile(token);
    const shareUsername = allVideos.map((v) => usernameFromShareUrl(v.share_url)).find(Boolean) ?? null;
    const resolvedUsername = profile.username ?? shareUsername ?? username;

    const accountId = await getOrCreateAccount('tiktok', resolvedUsername);
    const repairedZeroSnapshots = await repairZeroedApiSnapshots(accountId);
    const existingVideoIds = await loadExistingTikTokVideoIds(accountId, ids);

    let missingApiMetrics = 0;
    let preservedMetrics = 0;

    const importRows: ImportVideoRow[] = allVideos.map((v) => {
      const m = metricsById.get(v.id);
      const hasApiMetrics = metricsById.has(v.id);
      const publishedAt = v.create_time
        ? new Date(v.create_time * 1000).toISOString()
        : new Date().toISOString();
      const preserveMetrics = !hasApiMetrics && existingVideoIds.has(v.id);
      if (preserveMetrics) preservedMetrics++;
      if (!hasApiMetrics) missingApiMetrics++;

      return {
        video_id: v.id,
        title: v.title ?? null,
        caption: v.video_description ?? null,
        post_url: v.share_url ?? null,
        thumbnail_url: v.cover_image_url ?? null,
        published_at: publishedAt,
        views: hasApiMetrics ? (m?.view_count ?? 0) : 0,
        likes: hasApiMetrics ? (m?.like_count ?? 0) : 0,
        comments: hasApiMetrics ? (m?.comment_count ?? 0) : 0,
        shares: hasApiMetrics ? (m?.share_count ?? 0) : 0,
        preserve_metrics: preserveMetrics,
      };
    });

    const result = await importVideoRows(importRows, {
      platform: 'tiktok',
      username: resolvedUsername,
      source: 'api_display',
    });

    await alignTikTokConnectionToAccount(accountId);

    const purged = await purgeDemoSeedVideos(resolvedUsername);
    await classifyTikTokVideos({ onlyMissing: true });
    await clearStaleTikTokFollowers();

    await refreshPostingTimeAnalytics({
      creatorId: accountId,
      platform: 'tiktok',
      demoMode: env.DEMO_MODE,
    });

    if ((profile.username ?? shareUsername) && row) {
      await db
        .update(creatorPlatformConnections)
        .set({
          platformUsername: profile.username ?? shareUsername,
          updatedAt: new Date(),
        })
        .where(eq(creatorPlatformConnections.id, row.id));
    }

    const { loadVideosWithLatestMetrics } = await import('../creator-analytics/dashboard.js');
    const { filterVideosForDisplay, resolveTikTokAnalyticsContext } = await import(
      '../creator-analytics/tiktok-context.js',
    );
    const videoLoad = await loadVideosWithLatestMetrics('tiktok');
    const tiktokCtxForTotals = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
    const displayVideos = filterVideosForDisplay(videoLoad.videos, tiktokCtxForTotals);
    let totalViews = 0;
    let totalEngagement = 0;
    for (const v of displayVideos) {
      totalViews += v.views ?? 0;
      totalEngagement += (v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0);
    }

    const followers =
      profile.followerCount != null && profile.followerCount < 100_000
        ? profile.followerCount
        : null;

    await updateConnectorMetrics(provider, {
      connected: true,
      accountId: row!.platformUserId,
      accountName: profile.username ?? profile.displayName ?? row!.platformUsername,
      postCount: importRows.length,
      totalViews,
      totalEngagement,
      followers,
      markSuccess: true,
    });

    try {
      const { emitDataChange } = await import('../data-revision/index.js');
      await emitDataChange({
        eventType: 'analytics_sync',
        domains: ['analytics', 'home_briefing', 'recommendations'],
        completedAt: new Date().toISOString(),
        source: 'tiktok_sync',
        success: true,
        metadata: { imported: result.imported, updated: result.updated },
      });
    } catch (err) {
      console.warn('[tiktok-sync] data revision emit failed:', err instanceof Error ? err.message : err);
    }

    try {
      const { matchPublishedVideosToDrafts } = await import('../draft-intelligence/tiktok-match.js');
      await matchPublishedVideosToDrafts(row!.creatorAccountId);
    } catch (err) {
      console.warn('[tiktok-sync] draft match failed:', err instanceof Error ? err.message : err);
    }

    return {
      provider,
      ok: true,
      imported: result.imported,
      updated: result.updated,
      reason: purged > 0 ? `purged_${purged}_demo_videos` : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TikTok sync failed';
    console.warn('[tiktok-sync]', message);
    if (env.DEMO_MODE && !connected) {
      const fallback = await syncProviderFromLocalData(provider);
      return { ...fallback, reason: `demo_fallback: ${message}` };
    }
    await markConnectorSyncError(provider, message);
    return { provider, ok: false, error: message };
  }
}
