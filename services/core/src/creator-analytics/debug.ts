import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  analyticsConnectors,
  creatorMetricsSnapshots,
  creatorPlatformConnections,
  creatorVideos,
} from '../schema.js';
import {
  getTikTokConnectionRow,
  resolveDefaultTikTokCreatorAccountId,
} from '../tiktok-oauth/connections.js';
import { resolveTikTokAnalyticsContext } from './tiktok-context.js';

export async function computeTikTokAnalyticsDebug(globalDemoMode: boolean) {
  const ctx = await resolveTikTokAnalyticsContext(globalDemoMode);
  const creatorAccountId = await resolveDefaultTikTokCreatorAccountId();
  const connectionRow = await getTikTokConnectionRow(creatorAccountId);

  const [connector] = await db
    .select()
    .from(analyticsConnectors)
    .where(eq(analyticsConnectors.provider, 'tiktok'))
    .limit(1);

  const videos = await db
    .select()
    .from(creatorVideos)
    .where(eq(creatorVideos.platform, 'tiktok'))
    .orderBy(desc(creatorVideos.publishedAt))
    .limit(500);

  const sourceCounts: Record<string, number> = {};
  const sampleVideos = [];

  for (const v of videos.slice(0, 3)) {
    const [snap] = await db
      .select()
      .from(creatorMetricsSnapshots)
      .where(eq(creatorMetricsSnapshots.videoId, v.id))
      .orderBy(desc(creatorMetricsSnapshots.collectedAt))
      .limit(1);
    if (snap) {
      sourceCounts[snap.source] = (sourceCounts[snap.source] ?? 0) + 1;
    }
    sampleVideos.push({
      videoId: v.videoId,
      title: v.title,
      caption: v.caption?.slice(0, 120) ?? null,
      contentCategory: v.contentCategory,
      locationTag: v.locationTag,
      sponsorTag: v.sponsorTag,
      metadata: v.metadata,
      metrics: snap
        ? {
            source: snap.source,
            views: snap.views,
            likes: snap.likes,
            comments: snap.comments,
            shares: snap.shares,
            engagementRate: snap.engagementRate,
            followerCountSnapshot: snap.followerCountSnapshot,
            collectedAt: snap.collectedAt.toISOString(),
          }
        : null,
    });
  }

  for (const v of videos) {
    const [snap] = await db
      .select({ source: creatorMetricsSnapshots.source })
      .from(creatorMetricsSnapshots)
      .where(eq(creatorMetricsSnapshots.videoId, v.id))
      .orderBy(desc(creatorMetricsSnapshots.collectedAt))
      .limit(1);
    if (snap) sourceCounts[snap.source] = (sourceCounts[snap.source] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    globalDemoMode,
    context: ctx,
    connection: connectionRow
      ? {
          id: connectionRow.id,
          status: connectionRow.status,
          platformUserId: connectionRow.platformUserId,
          platformUsername: connectionRow.platformUsername,
          scopes: connectionRow.scopes,
          connectedAt: connectionRow.connectedAt?.toISOString() ?? null,
          expiresAt: connectionRow.expiresAt?.toISOString() ?? null,
          lastError: connectionRow.lastError,
        }
      : null,
    connector: connector
      ? {
          connected: connector.connected,
          followers: connector.followers,
          postCount: connector.postCount,
          totalViews: connector.totalViews,
          totalEngagement: connector.totalEngagement,
          syncStatus: connector.syncStatus,
          lastSyncAt: connector.lastSyncAt?.toISOString() ?? null,
          lastSuccessfulSyncAt: connector.lastSuccessfulSyncAt?.toISOString() ?? null,
          lastSyncError: connector.lastSyncError,
        }
      : null,
    videoCounts: {
      total: videos.length,
      live: videos.filter((v) => !v.videoId.startsWith('demo_tt_')).length,
      demoSeed: videos.filter((v) => v.videoId.startsWith('demo_tt_')).length,
      byMetricsSource: sourceCounts,
      taggedCategory: videos.filter((v) => v.contentCategory).length,
      taggedLocation: videos.filter((v) => v.locationTag).length,
      taggedSponsor: videos.filter((v) => v.sponsorTag).length,
    },
    metricProvenance: {
      followers: ctx.followersAvailable
        ? { value: ctx.followersCount, from: 'analytics_connectors.followers (tiktok_api)' }
        : {
            value: null,
            from:
              ctx.followersSource === 'unavailable'
                ? 'unavailable — current TikTok scopes (user.info.basic) do not include follower count'
                : ctx.followersSource === 'demo_seed'
                  ? 'cleared — was demo seed snapshot (125k range)'
                  : 'unavailable',
          },
      totalViews: {
        from: 'sum(latest creator_metrics_snapshots.views) for live videos',
      },
      engagement: {
        from: 'sum(likes + comments + shares) per video snapshot',
      },
      engagementRate: {
        from: '(likes + comments + shares) / views per video',
      },
    },
    sampleVideos,
  };
}
