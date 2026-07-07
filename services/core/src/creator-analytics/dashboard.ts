import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorAccounts,
  creatorMetricsSnapshots,
  creatorVideos,
  type Platform,
} from '../schema.js';
import { postTimeBucket, weekdayBucket } from './parse.js';
import { listAnalyticsConnectors } from '../analytics-connectors/registry.js';
import { getAnalyticsConnectorSettings } from '../analytics-connectors/settings.js';
import { getAnalyticsSyncStatus } from '../creator-analytics-sync/index.js';
import {
  filterVideosForDisplay,
  resolveTikTokAnalyticsContext,
} from './tiktok-context.js';
import { resolveActiveTikTokCreatorAccountId } from '../tiktok-oauth/connections.js';
import type {
  AnalyticsHubSummary,
  AnalyticsRecommendation,
  CreatorAnalyticsDashboard,
  DimensionPerformance,
  PatternCard,
  TrendPoint,
  VideoWithMetrics,
} from './types.js';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toVideoWithMetrics(
  video: typeof creatorVideos.$inferSelect,
  snap: typeof creatorMetricsSnapshots.$inferSelect,
  medianViews: number,
): VideoWithMetrics {
  const views = snap.views ?? 0;
  const engagementRate = snap.engagementRate != null ? Number(snap.engagementRate) : 0;
  const performanceIndex = medianViews > 0 ? Math.round((views / medianViews) * 100) / 100 : 1;

  return {
    id: video.id,
    platform: video.platform,
    videoId: video.videoId,
    title: video.title,
    caption: video.caption,
    postUrl: video.postUrl,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt.toISOString(),
    contentCategory: video.contentCategory,
    contentPillar: video.contentPillar,
    locationTag: video.locationTag,
    sponsorTag: video.sponsorTag,
    opportunityId: video.opportunityId,
    views,
    likes: snap.likes,
    comments: snap.comments,
    shares: snap.shares,
    saves: snap.saves,
    engagementRate,
    watchTimeSeconds: snap.watchTimeSeconds,
    averageWatchDurationSeconds:
      snap.averageWatchDurationSeconds != null
        ? Number(snap.averageWatchDurationSeconds)
        : null,
    completionRate: snap.completionRate != null ? Number(snap.completionRate) : null,
    followerCountSnapshot: snap.followerCountSnapshot,
    performanceIndex,
    postTimeBucket: postTimeBucket(video.publishedAt),
  };
}

function dimensionRollup(
  videos: VideoWithMetrics[],
  pick: (v: VideoWithMetrics) => string | null | undefined,
  medianViews: number,
): DimensionPerformance[] {
  const groups = new Map<string, VideoWithMetrics[]>();

  for (const v of videos) {
    const key = pick(v)?.trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      const views = items.map((i) => i.views);
      const avgViews = avg(views);
      const avgEngagementRate = avg(items.map((i) => i.engagementRate));
      return {
        key,
        label: key.replace(/_/g, ' '),
        videoCount: items.length,
        avgViews: Math.round(avgViews),
        avgEngagementRate: Math.round(avgEngagementRate * 10000) / 10000,
        totalViews: views.reduce((a, b) => a + b, 0),
        performanceIndex: medianViews > 0 ? Math.round((avgViews / medianViews) * 100) / 100 : 1,
      };
    })
    .sort((a, b) => b.avgViews - a.avgViews || b.avgEngagementRate - a.avgEngagementRate);
}

function patternCards(
  videos: VideoWithMetrics[],
  medianViews: number,
  mode: 'winner' | 'underperformer',
): PatternCard[] {
  const groups = new Map<string, VideoWithMetrics[]>();

  for (const v of videos) {
    const parts = [
      v.contentCategory ? `category:${v.contentCategory}` : null,
      v.locationTag ? `location:${v.locationTag}` : null,
      v.contentPillar ? `pillar:${v.contentPillar}` : null,
    ].filter(Boolean);
    if (parts.length < 2) continue;
    const key = parts.join('|');
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }

  const cards: PatternCard[] = [];

  for (const [key, items] of groups) {
    if (items.length < 3) continue;
    const avgViews = avg(items.map((i) => i.views));
    const avgEngagementRate = avg(items.map((i) => i.engagementRate));
    const performanceIndex = medianViews > 0 ? avgViews / medianViews : 1;

    const isWinner = performanceIndex >= 1.5;
    const isUnder = performanceIndex <= 0.6;
    if (mode === 'winner' && !isWinner) continue;
    if (mode === 'underperformer' && !isUnder) continue;

    const dimensions: Record<string, string> = {};
    for (const part of key.split('|')) {
      const [dim, val] = part.split(':');
      if (dim && val) dimensions[dim] = val;
    }

    cards.push({
      label: Object.values(dimensions).join(' · '),
      dimensions,
      videoCount: items.length,
      avgViews: Math.round(avgViews),
      avgEngagementRate: Math.round(avgEngagementRate * 10000) / 10000,
      performanceIndex: Math.round(performanceIndex * 100) / 100,
      sampleVideoIds: items.slice(0, 3).map((i) => i.id),
    });
  }

  return cards.sort((a, b) =>
    mode === 'winner'
      ? b.performanceIndex - a.performanceIndex
      : a.performanceIndex - b.performanceIndex,
  );
}

function buildTrends(videos: VideoWithMetrics[]): { growth: TrendPoint[]; engagement: TrendPoint[] } {
  const periodMap = new Map<
    string,
    { views: number; engagement: number; engagementRates: number[]; count: number }
  >();

  for (const v of videos) {
    const period = v.publishedAt.slice(0, 7);
    const bucket = periodMap.get(period) ?? {
      views: 0,
      engagement: 0,
      engagementRates: [],
      count: 0,
    };
    bucket.views += v.views;
    bucket.engagement += v.likes + v.comments + v.shares;
    bucket.engagementRates.push(v.engagementRate);
    bucket.count++;
    periodMap.set(period, bucket);
  }

  const periods = [...periodMap.keys()].sort();
  const growth: TrendPoint[] = periods.map((period) => {
    const b = periodMap.get(period)!;
    return {
      period,
      totalViews: b.views,
      totalEngagement: b.engagement,
      avgEngagementRate: Math.round(avg(b.engagementRates) * 10000) / 10000,
      videoCount: b.count,
    };
  });

  const engagement: TrendPoint[] = periods.map((period) => {
    const b = periodMap.get(period)!;
    return {
      period,
      totalViews: b.views,
      totalEngagement: b.engagement,
      avgEngagementRate: Math.round(avg(b.engagementRates) * 10000) / 10000,
      videoCount: b.count,
    };
  });

  return { growth, engagement };
}

function confidenceFromSample(n: number): number {
  if (n <= 1) return 0;
  if (n <= 2) return 0.5;
  if (n <= 5) return 0.55;
  if (n <= 10) return 0.75;
  return 0.9;
}

function buildRecommendations(
  categories: DimensionPerformance[],
  locations: DimensionPerformance[],
  sponsors: DimensionPerformance[],
  postingTimes: DimensionPerformance[],
  underperformers: PatternCard[],
  topVideos: VideoWithMetrics[],
): AnalyticsRecommendation[] {
  const recs: AnalyticsRecommendation[] = [];

  const topCategory = categories.find((c) => c.videoCount >= 2 && c.performanceIndex >= 1.1);
  if (topCategory) {
    const proof = topVideos
      .filter((v) => v.contentCategory === topCategory.key)
      .slice(0, 3)
      .map((v) => v.title ?? v.caption ?? v.videoId);
    recs.push({
      type: 'repeat_topic',
      confidence: confidenceFromSample(topCategory.videoCount),
      message: `${topCategory.label} videos outperform baseline (${topCategory.performanceIndex}× avg views). Pitch local ${topCategory.label.replace(/_/g, ' ')} sponsors using your top posts as proof.`,
      evidence: {
        sampleSize: topCategory.videoCount,
        performanceIndex: topCategory.performanceIndex,
        dimension: 'content_category',
        value: proof.join(' · ') || topCategory.key,
      },
    });
  }

  const topLocation = locations.find((l) => l.videoCount >= 2 && l.performanceIndex >= 1.1);
  if (topLocation) {
    recs.push({
      type: 'repeat_location',
      confidence: confidenceFromSample(topLocation.videoCount),
      message: `${topLocation.label.replace(/_/g, ' ')} content pulls ${Math.round(topLocation.avgViews).toLocaleString()} avg views — prioritize KC businesses in this area for sponsor outreach.`,
      evidence: {
        sampleSize: topLocation.videoCount,
        performanceIndex: topLocation.performanceIndex,
        dimension: 'location_tag',
        value: topLocation.key,
      },
    });
  }

  const topSponsor = sponsors.find((s) => s.videoCount >= 2 && s.performanceIndex >= 1.05);
  if (topSponsor) {
    recs.push({
      type: 'repeat_sponsor_type',
      confidence: confidenceFromSample(topSponsor.videoCount),
      message: `"${topSponsor.label.replace(/_/g, ' ')}" sponsor angles perform well — lead with similar local brands in your pitch deck.`,
      evidence: {
        sampleSize: topSponsor.videoCount,
        performanceIndex: topSponsor.performanceIndex,
        dimension: 'sponsor_tag',
        value: topSponsor.key,
      },
    });
  }

  const proofVideos = [...topVideos]
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
  if (proofVideos.length >= 3) {
    const avgViews = Math.round(avg(proofVideos.map((v) => v.views)));
    recs.push({
      type: 'repeat_sponsor_type',
      confidence: 0.85,
      message: `Use your top ${proofVideos.length} videos (${avgViews.toLocaleString()} avg views) as sponsor proof — they show reach beyond follower count alone.`,
      evidence: {
        sampleSize: proofVideos.length,
        performanceIndex: proofVideos[0]?.performanceIndex ?? 1,
        dimension: 'top_videos',
        value: proofVideos.map((v) => v.title ?? v.videoId).join(' · '),
      },
    });
  }

  const topTime = postingTimes.find((t) => t.videoCount >= 2 && t.performanceIndex >= 1.15);
  if (topTime && recs.length < 6) {
    recs.push({
      type: 'post_time',
      confidence: confidenceFromSample(topTime.videoCount),
      message: `Posting ${topTime.label} correlates with ${topTime.performanceIndex}× typical views — schedule sponsor-ready content in that window.`,
      evidence: {
        sampleSize: topTime.videoCount,
        performanceIndex: topTime.performanceIndex,
        dimension: 'post_time',
        value: topTime.key,
      },
    });
  }

  const weakCategory = categories.find((c) => c.videoCount >= 3 && c.performanceIndex <= 0.65);
  if (weakCategory) {
    recs.push({
      type: 'avoid_category',
      confidence: confidenceFromSample(weakCategory.videoCount),
      message: `Avoid or rethink "${weakCategory.label}" — underperforming at ${weakCategory.performanceIndex}× baseline.`,
      evidence: {
        sampleSize: weakCategory.videoCount,
        performanceIndex: weakCategory.performanceIndex,
        dimension: 'content_category',
        value: weakCategory.key,
      },
    });
  }

  for (const pattern of underperformers.slice(0, 2)) {
    if (pattern.dimensions.category) {
      recs.push({
        type: 'avoid_category',
        confidence: confidenceFromSample(pattern.videoCount),
        message: `Underperforming pattern: ${pattern.label} (${pattern.performanceIndex}× baseline).`,
        evidence: {
          sampleSize: pattern.videoCount,
          performanceIndex: pattern.performanceIndex,
          dimension: 'pattern',
          value: pattern.label,
        },
      });
    }
  }

  return recs
    .filter((r) => r.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

export async function loadVideosWithLatestMetrics(
  platform: Platform,
): Promise<{
  account: typeof creatorAccounts.$inferSelect | null;
  videos: VideoWithMetrics[];
  snapshots: typeof creatorMetricsSnapshots.$inferSelect[];
}> {
  const account =
    platform === 'tiktok'
      ? (await db
          .select()
          .from(creatorAccounts)
          .where(eq(creatorAccounts.id, await resolveActiveTikTokCreatorAccountId()))
          .limit(1))[0] ?? null
      : (await db
          .select()
          .from(creatorAccounts)
          .where(eq(creatorAccounts.platform, platform))
          .limit(1))[0] ?? null;
  if (!account) {
    return { account: null, videos: [], snapshots: [] };
  }

  const videoRows = await db
    .select()
    .from(creatorVideos)
    .where(eq(creatorVideos.accountId, account.id))
    .orderBy(desc(creatorVideos.publishedAt));

  const allSnapshots: typeof creatorMetricsSnapshots.$inferSelect[] = [];
  const enriched: VideoWithMetrics[] = [];

  const viewCounts: number[] = [];

  for (const video of videoRows) {
    const [snap] = await db
      .select()
      .from(creatorMetricsSnapshots)
      .where(eq(creatorMetricsSnapshots.videoId, video.id))
      .orderBy(desc(creatorMetricsSnapshots.collectedAt))
      .limit(1);
    if (!snap) continue;
    allSnapshots.push(snap);
    viewCounts.push(snap.views);
  }

  const medianViews = median(viewCounts);

  for (const video of videoRows) {
    const [snap] = await db
      .select()
      .from(creatorMetricsSnapshots)
      .where(eq(creatorMetricsSnapshots.videoId, video.id))
      .orderBy(desc(creatorMetricsSnapshots.collectedAt))
      .limit(1);
    if (!snap) continue;
    enriched.push(toVideoWithMetrics(video, snap, medianViews));
  }

  return { account, videos: enriched, snapshots: allSnapshots };
}

export async function computePlatformDashboard(
  platform: Platform,
  demoMode: boolean,
): Promise<CreatorAnalyticsDashboard> {
  const tiktokCtx =
    platform === 'tiktok' ? await resolveTikTokAnalyticsContext(demoMode) : null;

  let { account, videos } = await loadVideosWithLatestMetrics(platform);
  if (tiktokCtx) {
    videos = filterVideosForDisplay(videos, tiktokCtx);
  }

  const viewCounts = videos.map((v) => v.views);
  const medianViews = median(viewCounts);

  const topVideos = [...videos]
    .sort((a, b) => b.views - a.views || b.engagementRate - a.engagementRate)
    .slice(0, 10);

  const topByEngagement = [...videos]
    .filter((v) => v.views >= 500)
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 10);

  const recentVideos = [...videos]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 10);

  const allCategories = dimensionRollup(videos, (v) => v.contentCategory, medianViews);
  const allLocations = dimensionRollup(videos, (v) => v.locationTag, medianViews);
  const allPostingTimes = dimensionRollup(
    videos,
    (v) => weekdayBucket(new Date(v.publishedAt)),
    medianViews,
  );
  const allSponsors = dimensionRollup(videos, (v) => v.sponsorTag, medianViews);

  const topCategories = allCategories.slice(0, 8);
  const topLocations = allLocations.slice(0, 8);
  const topPostingTimes = allPostingTimes.slice(0, 8);
  const sponsorPerformance = allSponsors.slice(0, 8);

  const { growth, engagement } = buildTrends(videos);

  const repeatableWinners = patternCards(videos, medianViews, 'winner').slice(0, 6);
  const underperformers = patternCards(videos, medianViews, 'underperformer').slice(0, 6);

  const recommendations = buildRecommendations(
    allCategories,
    allLocations,
    allSponsors,
    allPostingTimes,
    underperformers,
    topVideos,
  );

  const latestDate =
    videos.length > 0
      ? videos.reduce((max, v) => (v.publishedAt > max ? v.publishedAt : max), videos[0]!.publishedAt)
      : null;

  const effectiveDemoMode = tiktokCtx?.effectiveDemoMode ?? demoMode;
  const dataSource = tiktokCtx?.hasLiveData ? 'live' : 'demo';

  return {
    demoMode: effectiveDemoMode,
    dataSource,
    platform,
    account: account
      ? {
          id: account.id,
          username: tiktokCtx?.platformUsername ?? account.username,
          displayName: account.displayName,
          videoCount: videos.length,
          platformUserId: tiktokCtx?.platformUserId ?? null,
          usernameAvailable: tiktokCtx?.usernameAvailable ?? true,
        }
      : null,
    connection:
      platform === 'tiktok' && tiktokCtx
        ? {
            status: tiktokCtx.connectionStatus,
            platformUserId: tiktokCtx.platformUserId,
            platformUsername: tiktokCtx.platformUsername,
            usernameAvailable: tiktokCtx.usernameAvailable,
            connectedAt: tiktokCtx.connectedAt,
            expiresAt: tiktokCtx.expiresAt,
            scopes: tiktokCtx.scopes,
            lastSuccessfulSyncAt: tiktokCtx.lastSuccessfulSyncAt,
          }
        : null,
    followersAvailable: tiktokCtx?.followersAvailable ?? false,
    followersCount: tiktokCtx?.followersCount ?? null,
    trendLabels: {
      views: 'Views trend = sum(video views) grouped by publish month',
      engagement:
        'Engagement trend = sum(likes + comments + shares) grouped by publish month',
    },
    summary: {
      totalVideos: videos.length,
      totalViews: viewCounts.reduce((a, b) => a + b, 0),
      avgEngagementRate: Math.round(avg(videos.map((v) => v.engagementRate)) * 10000) / 10000,
      medianViews,
      dataThrough: latestDate,
    },
    topVideos: topByEngagement.length > 0 ? topByEngagement.slice(0, 10) : topVideos,
    recentVideos,
    topCategories,
    topLocations,
    topPostingTimes,
    growthTrend: growth.slice(-12),
    engagementTrend: engagement.slice(-12),
    sponsorPerformance,
    repeatableWinners,
    underperformers,
    recommendations,
  };
}

const SETTINGS_HREF: Record<string, string> = {
  tiktok: '/analytics/tiktok/settings',
  facebook: '/analytics/meta/settings',
  instagram: '/analytics/meta/settings',
  youtube: '/analytics',
};

export async function computeAnalyticsHub(demoMode: boolean): Promise<AnalyticsHubSummary> {
  const platforms: Platform[] = ['tiktok', 'instagram', 'youtube_shorts'];
  const [connectorRows, syncStatus, settings, tiktokCtx] = await Promise.all([
    listAnalyticsConnectors(),
    getAnalyticsSyncStatus(),
    getAnalyticsConnectorSettings(),
    resolveTikTokAnalyticsContext(demoMode),
  ]);

  const visibleConnectors = connectorRows.filter((c) => c.enabled && c.provider !== 'youtube');

  const entries = await Promise.all(
    platforms.map(async (platform) => {
      if (platform === 'instagram' && !settings.instagram.enabled) {
        return null;
      }
      if (platform === 'youtube_shorts' && !settings.youtube.enabled) {
        return null;
      }
      const { videos } = await loadVideosWithLatestMetrics(platform);
      const totalViews = videos.reduce((a, v) => a + v.views, 0);
      const connector = connectorRows.find(
        (c) =>
          (platform === 'tiktok' && c.provider === 'tiktok') ||
          (platform === 'instagram' && c.provider === 'instagram'),
      );
      const hasData = videos.length > 0;
      const connected = connector?.connected ?? false;
      return {
        platform,
        label: platform.replace(/_/g, ' '),
        videoCount: connector?.postCount ?? videos.length,
        totalViews: connector?.totalViews ?? totalViews,
        available: hasData || connected,
        href: platform === 'tiktok' ? '/analytics/tiktok' : `/analytics/${platform}`,
      };
    }),
  );

  const connectors = visibleConnectors.map((c) => {
    const followers =
      c.provider === 'tiktok' && tiktokCtx.hasLiveData
        ? tiktokCtx.followersAvailable
          ? tiktokCtx.followersCount
          : null
        : c.followers;
    return {
      provider: c.provider,
      label: c.label,
      connected: c.connected,
      accountStatus: c.connected ? (c.syncStatus === 'error' ? 'sync_error' : 'connected') : 'disconnected',
      accountId: c.accountId,
      accountName:
        c.provider === 'tiktok'
          ? (tiktokCtx.platformUsername ?? c.accountName)
          : c.accountName,
      followers,
      followersAvailable: c.provider === 'tiktok' ? tiktokCtx.followersAvailable : undefined,
      postCount: c.postCount,
      totalViews: c.totalViews,
      totalEngagement: c.totalEngagement,
      lastSyncAt: c.lastSyncAt,
      lastSuccessfulSyncAt: c.lastSuccessfulSyncAt,
      lastSyncError: c.lastSyncError,
      syncStatus: c.syncStatus,
      settingsHref: SETTINGS_HREF[c.provider] ?? '/analytics',
    };
  });

  return {
    demoMode: tiktokCtx.hasLiveData ? false : demoMode,
    readOnly: true,
    syncInProgress: syncStatus.inProgress,
    connectors,
    platforms: entries.filter((e): e is NonNullable<typeof e> => e != null),
    connectorSettings: {
      facebook: { enabled: settings.facebook.enabled },
      instagram: { enabled: settings.instagram.enabled },
      youtube: { enabled: settings.youtube.enabled },
    },
  };
}

export async function hasPlatformData(platform: Platform): Promise<boolean> {
  const rows = await db
    .select({ id: creatorVideos.id })
    .from(creatorVideos)
    .where(eq(creatorVideos.platform, platform))
    .limit(1);
  return rows.length > 0;
}
