import { and, eq, not, like } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorMetricsSnapshots, creatorVideos } from '../schema.js';
import type { AnalyticsConnectorProvider } from '../analytics-connectors/constants.js';
import { updateConnectorMetrics } from '../analytics-connectors/state.js';
import type { ProviderSyncResult } from './types.js';

const PLATFORM_BY_PROVIDER: Partial<Record<AnalyticsConnectorProvider, typeof creatorVideos.$inferSelect.platform>> = {
  tiktok: 'tiktok',
  instagram: 'instagram',
  facebook: 'facebook',
};

export async function syncProviderFromLocalData(
  provider: AnalyticsConnectorProvider,
): Promise<ProviderSyncResult> {
  const platform = PLATFORM_BY_PROVIDER[provider];
  if (!platform) {
    return { provider, ok: true, skipped: true, reason: 'no_local_platform' };
  }

  const videos = await db
    .select({
      video: creatorVideos,
      snap: creatorMetricsSnapshots,
    })
    .from(creatorVideos)
    .innerJoin(
      creatorMetricsSnapshots,
      eq(creatorMetricsSnapshots.videoId, creatorVideos.id),
    )
    .where(
      platform === 'tiktok'
        ? and(eq(creatorVideos.platform, platform), not(like(creatorVideos.videoId, 'demo_tt_%')))
        : eq(creatorVideos.platform, platform),
    );

  const latestByVideo = new Map<string, typeof creatorMetricsSnapshots.$inferSelect>();
  for (const row of videos) {
    const prev = latestByVideo.get(row.video.id);
    if (!prev || row.snap.collectedAt > prev.collectedAt) {
      latestByVideo.set(row.video.id, row.snap);
    }
  }

  let totalViews = 0;
  let totalEngagement = 0;
  for (const snap of latestByVideo.values()) {
    totalViews += snap.views ?? 0;
    totalEngagement +=
      (snap.likes ?? 0) + (snap.comments ?? 0) + (snap.shares ?? 0) + (snap.saves ?? 0);
  }

  await updateConnectorMetrics(provider, {
    postCount: latestByVideo.size,
    totalViews,
    totalEngagement,
    followers: null,
    markSuccess: true,
  });

  return {
    provider,
    ok: true,
    imported: 0,
    updated: latestByVideo.size,
  };
}
