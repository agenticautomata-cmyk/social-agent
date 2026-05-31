import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorAccounts,
  creatorMetricsSnapshots,
  creatorVideos,
  type Platform,
} from '../schema.js';
import { postTimeBucket, weekdayBucket } from './parse.js';
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

function buildTrends(
  videos: VideoWithMetrics[],
  snapshots: Array<{ videoId: string; collectedAt: Date; views: number; engagementRate: string | null }>,
): { growth: TrendPoint[]; engagement: TrendPoint[] } {
  const weekMap = new Map<string, { views: number[]; engagement: number[]; count: number }>();

  for (const v of videos) {
    const week = v.publishedAt.slice(0, 10).replace(/-\d{2}$/, '-W') + v.publishedAt.slice(5, 7);
    const bucket = weekMap.get(week) ?? { views: [], engagement: [], count: 0 };
    bucket.views.push(v.views);
    bucket.engagement.push(v.engagementRate);
    bucket.count++;
    weekMap.set(week, bucket);
  }

  // Also aggregate snapshot history by month for richer trend when available
  for (const snap of snapshots) {
    const period = snap.collectedAt.toISOString().slice(0, 7);
    const bucket = weekMap.get(period) ?? { views: [], engagement: [], count: 0 };
    bucket.views.push(snap.views);
    bucket.engagement.push(snap.engagementRate != null ? Number(snap.engagementRate) : 0);
    bucket.count++;
    weekMap.set(period, bucket);
  }

  const periods = [...weekMap.keys()].sort();
  const growth: TrendPoint[] = periods.map((period) => {
    const b = weekMap.get(period)!;
    return {
      period,
      totalViews: b.views.reduce((a, c) => a + c, 0),
      avgEngagementRate: Math.round(avg(b.engagement) * 10000) / 10000,
      videoCount: b.count,
    };
  });

  return { growth, engagement: growth };
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
): AnalyticsRecommendation[] {
  const recs: AnalyticsRecommendation[] = [];

  const topCategory = categories.find((c) => c.videoCount >= 3 && c.performanceIndex >= 1.2);
  if (topCategory) {
    recs.push({
      type: 'repeat_topic',
      confidence: confidenceFromSample(topCategory.videoCount),
      message: `Repeat "${topCategory.label}" content — it averages ${topCategory.performanceIndex}× your typical views.`,
      evidence: {
        sampleSize: topCategory.videoCount,
        performanceIndex: topCategory.performanceIndex,
        dimension: 'content_category',
        value: topCategory.key,
      },
    });
  }

  const topLocation = locations.find((l) => l.videoCount >= 3 && l.performanceIndex >= 1.2);
  if (topLocation) {
    recs.push({
      type: 'repeat_location',
      confidence: confidenceFromSample(topLocation.videoCount),
      message: `Repeat ${topLocation.label} location coverage — ${Math.round(topLocation.avgViews).toLocaleString()} avg views.`,
      evidence: {
        sampleSize: topLocation.videoCount,
        performanceIndex: topLocation.performanceIndex,
        dimension: 'location_tag',
        value: topLocation.key,
      },
    });
  }

  const topSponsor = sponsors.find((s) => s.videoCount >= 2 && s.performanceIndex >= 1.1);
  if (topSponsor) {
    recs.push({
      type: 'repeat_sponsor_type',
      confidence: confidenceFromSample(topSponsor.videoCount),
      message: `Sponsor type "${topSponsor.label}" is outperforming — pitch similar brands.`,
      evidence: {
        sampleSize: topSponsor.videoCount,
        performanceIndex: topSponsor.performanceIndex,
        dimension: 'sponsor_tag',
        value: topSponsor.key,
      },
    });
  }

  const topTime = postingTimes.find((t) => t.videoCount >= 2 && t.performanceIndex >= 1.15);
  if (topTime) {
    recs.push({
      type: 'post_time',
      confidence: confidenceFromSample(topTime.videoCount),
      message: `Post more often at ${topTime.label} — ${topTime.performanceIndex}× typical performance.`,
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
  const accounts = await db
    .select()
    .from(creatorAccounts)
    .where(eq(creatorAccounts.platform, platform))
    .limit(1);

  const account = accounts[0] ?? null;
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
  const { account, videos, snapshots } = await loadVideosWithLatestMetrics(platform);

  const viewCounts = videos.map((v) => v.views);
  const medianViews = median(viewCounts);

  const topVideos = [...videos]
    .sort((a, b) => b.views - a.views || b.engagementRate - a.engagementRate)
    .slice(0, 10);

  const topByEngagement = [...videos]
    .filter((v) => v.views >= 500)
    .sort((a, b) => b.engagementRate - a.engagementRate)
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

  const { growth, engagement } = buildTrends(
    videos,
    snapshots.map((s) => ({
      videoId: s.videoId,
      collectedAt: s.collectedAt,
      views: s.views,
      engagementRate: s.engagementRate,
    })),
  );

  const repeatableWinners = patternCards(videos, medianViews, 'winner').slice(0, 6);
  const underperformers = patternCards(videos, medianViews, 'underperformer').slice(0, 6);

  const recommendations = buildRecommendations(
    allCategories,
    allLocations,
    allSponsors,
    allPostingTimes,
    underperformers,
  );

  const latestDate =
    videos.length > 0
      ? videos.reduce((max, v) => (v.publishedAt > max ? v.publishedAt : max), videos[0]!.publishedAt)
      : null;

  return {
    demoMode,
    platform,
    account: account
      ? {
          id: account.id,
          username: account.username,
          displayName: account.displayName,
          videoCount: videos.length,
        }
      : null,
    summary: {
      totalVideos: videos.length,
      totalViews: viewCounts.reduce((a, b) => a + b, 0),
      avgEngagementRate: Math.round(avg(videos.map((v) => v.engagementRate)) * 10000) / 10000,
      medianViews,
      dataThrough: latestDate,
    },
    topVideos: topByEngagement.length > 0 ? topByEngagement.slice(0, 10) : topVideos,
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

export async function computeAnalyticsHub(demoMode: boolean): Promise<AnalyticsHubSummary> {
  const platforms: Platform[] = ['tiktok', 'instagram', 'youtube_shorts'];

  const entries = await Promise.all(
    platforms.map(async (platform) => {
      const { videos } = await loadVideosWithLatestMetrics(platform);
      const totalViews = videos.reduce((a, v) => a + v.views, 0);
      return {
        platform,
        label: platform.replace(/_/g, ' '),
        videoCount: videos.length,
        totalViews,
        available: platform === 'tiktok' ? videos.length > 0 : false,
        href: platform === 'tiktok' ? '/analytics/tiktok' : `/analytics/${platform}`,
      };
    }),
  );

  return { demoMode, platforms: entries };
}

export async function hasPlatformData(platform: Platform): Promise<boolean> {
  const rows = await db
    .select({ id: creatorVideos.id })
    .from(creatorVideos)
    .where(eq(creatorVideos.platform, platform))
    .limit(1);
  return rows.length > 0;
}
