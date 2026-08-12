import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  analyticsConnectors,
  creatorMetricsSnapshots,
  creatorVideos,
} from '../schema.js';
import {
  getActiveTikTokConnectionRow,
  getTikTokConnectionStatus,
  resolveActiveTikTokCreatorAccountId,
} from '../tiktok-oauth/connections.js';

export type TikTokAnalyticsContext = {
  connected: boolean;
  connectionStatus: string;
  platformUserId: string | null;
  platformUsername: string | null;
  usernameAvailable: boolean;
  connectedAt: string | null;
  expiresAt: string | null;
  scopes: string[];
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  liveVideoCount: number;
  apiDisplayVideoCount: number;
  demoVideoCount: number;
  hasLiveData: boolean;
  effectiveDemoMode: boolean;
  globalDemoMode: boolean;
  followersCount: number | null;
  followersAvailable: boolean;
  followersSource: 'tiktok_api' | 'unavailable' | 'demo_seed' | null;
};

export async function resolveTikTokAnalyticsContext(
  globalDemoMode: boolean,
): Promise<TikTokAnalyticsContext> {
  const [status] = await Promise.all([
    getTikTokConnectionStatus(globalDemoMode),
    resolveActiveTikTokCreatorAccountId(),
  ]);
  const row = await getActiveTikTokConnectionRow();

  const videos = await db
    .select({
      id: creatorVideos.id,
      videoId: creatorVideos.videoId,
    })
    .from(creatorVideos)
    .where(eq(creatorVideos.platform, 'tiktok'));

  const liveVideos = videos.filter((v) => !v.videoId.startsWith('demo_tt_'));
  const demoVideos = videos.filter((v) => v.videoId.startsWith('demo_tt_'));

  let apiDisplayVideoCount = 0;
  for (const v of liveVideos) {
    const [snap] = await db
      .select({ source: creatorMetricsSnapshots.source })
      .from(creatorMetricsSnapshots)
      .where(eq(creatorMetricsSnapshots.videoId, v.id))
      .orderBy(desc(creatorMetricsSnapshots.collectedAt))
      .limit(1);
    if (snap?.source === 'api_display') apiDisplayVideoCount++;
  }

  const hasLiveData =
    status.status === 'connected' && apiDisplayVideoCount > 0 && liveVideos.length > 0;

  const [connector] = await db
    .select({
      followers: analyticsConnectors.followers,
      lastSuccessfulSyncAt: analyticsConnectors.lastSuccessfulSyncAt,
      lastSyncAt: analyticsConnectors.lastSyncAt,
    })
    .from(analyticsConnectors)
    .where(eq(analyticsConnectors.provider, 'tiktok'))
    .limit(1);

  let followersCount: number | null = connector?.followers ?? null;
  let followersSource: TikTokAnalyticsContext['followersSource'] = null;
  let followersAvailable = false;

  if (hasLiveData) {
    if (followersCount != null && followersCount > 0) {
      // Live connected accounts must not show demo-seed follower snapshots (125k range).
      const looksLikeDemoSeed = followersCount >= 100_000;
      if (looksLikeDemoSeed) {
        followersCount = null;
        followersSource = 'demo_seed';
      } else {
        followersAvailable = true;
        followersSource = 'tiktok_api';
      }
    } else {
      followersSource = 'unavailable';
    }
  } else if (followersCount != null) {
    followersSource = 'demo_seed';
    followersAvailable = false;
  }

  return {
    connected: status.status === 'connected',
    connectionStatus: status.status,
    platformUserId: row?.platformUserId ?? status.connection?.platformUserId ?? null,
    platformUsername: row?.platformUsername ?? status.connection?.platformUsername ?? null,
    usernameAvailable: Boolean(row?.platformUsername ?? status.connection?.platformUsername),
    connectedAt: row?.connectedAt?.toISOString() ?? status.connection?.connectedAt ?? null,
    expiresAt: row?.expiresAt?.toISOString() ?? status.connection?.expiresAt ?? null,
    scopes: row?.scopes ?? status.connection?.scopes ?? [],
    lastSyncAt: connector?.lastSyncAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: connector?.lastSuccessfulSyncAt?.toISOString() ?? null,
    liveVideoCount: liveVideos.length,
    apiDisplayVideoCount,
    demoVideoCount: demoVideos.length,
    hasLiveData,
    effectiveDemoMode: globalDemoMode && !hasLiveData,
    globalDemoMode,
    followersCount: followersAvailable ? followersCount : null,
    followersAvailable,
    followersSource,
  };
}

const STALE_SYNC_HOURS = 24;

/**
 * The single source of truth for "is TikTok data stale" — driven entirely by the live
 * connector/connection state, never by cached narrative text. Anything (chat, learning
 * cards, prompts) that wants to warn about staleness or tell Kellie to reconnect must use
 * this instead of re-deriving its own threshold, so the answer can never disagree with the
 * live integration state.
 */
export function isTikTokDataStale(ctx: Pick<TikTokAnalyticsContext, 'connected' | 'connectionStatus' | 'lastSuccessfulSyncAt'>): boolean {
  if (!ctx.connected || ctx.connectionStatus === 'expired') return true;
  if (!ctx.lastSuccessfulSyncAt) return true;
  const hoursSinceSync = (Date.now() - new Date(ctx.lastSuccessfulSyncAt).getTime()) / 3_600_000;
  return hoursSinceSync > STALE_SYNC_HOURS;
}

export async function clearStaleTikTokFollowers(): Promise<void> {
  await db
    .update(analyticsConnectors)
    .set({ followers: null, updatedAt: new Date() })
    .where(eq(analyticsConnectors.provider, 'tiktok'));
}

/** Prefer live API videos; drop demo seed rows when live data exists. */
export function filterVideosForDisplay<T extends { videoId: string }>(
  videos: T[],
  ctx: Pick<TikTokAnalyticsContext, 'hasLiveData'>,
): T[] {
  if (!ctx.hasLiveData) return videos;
  return videos.filter((v) => !v.videoId.startsWith('demo_tt_'));
}
