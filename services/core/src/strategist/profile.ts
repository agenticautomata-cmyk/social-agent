import { env } from '../env.js';
import { computePlatformDashboard, loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import {
  loadPostingTimeAnalytics,
  refreshPostingTimeAnalytics,
  type PostingTimeSlotAnalytics,
} from '../creator-analytics/posting-times.js';
import { filterVideosForDisplay, resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { computeVideoBusinessIntelligence } from '../sponsor-intelligence/video-businesses.js';
import { listAnalyticsConnectors } from '../analytics-connectors/registry.js';
import { resolveDefaultTikTokCreatorAccountId } from '../tiktok-oauth/connections.js';
import { resolveCreatorDisplayName } from '../benson-personality/index.js';
import type { VideoWithMetrics } from '../creator-analytics/types.js';
import type {
  CreatorProfileCategory,
  CreatorProfileDecline,
  CreatorProfilePeriodChange,
  CreatorProfilePostingTime,
  CreatorProfileTrendPoint,
  CreatorStrategistProfile,
} from './types.js';

const PERIOD_DAYS = 30;

function slotsToPostingTimes(slots: PostingTimeSlotAnalytics[]): CreatorProfilePostingTime[] {
  return slots.map((slot) => ({
    bucket: slot.label,
    videoCount: slot.videoCount,
    avgViews: slot.avgViews,
    performanceIndex: slot.performanceIndex,
  }));
}

function videosInLastDays(videos: VideoWithMetrics[], days: number): VideoWithMetrics[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return videos.filter((v) => new Date(v.publishedAt).getTime() >= cutoff);
}

function computePostingFrequency(videos: VideoWithMetrics[]) {
  const recent = videosInLastDays(videos, PERIOD_DAYS);
  const sorted = [...recent].sort(
    (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  );

  let avgDaysBetweenPosts: number | null = null;
  if (sorted.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days =
        (new Date(sorted[i]!.publishedAt).getTime() -
          new Date(sorted[i - 1]!.publishedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      gaps.push(days);
    }
    avgDaysBetweenPosts = Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10;
  }

  return {
    videosLast30d: recent.length,
    videosPerWeek: Math.round((recent.length / PERIOD_DAYS) * 7 * 10) / 10,
    avgDaysBetweenPosts,
  };
}

function computeRecentGrowth(trend: CreatorProfileTrendPoint[]): CreatorProfilePeriodChange[] {
  if (trend.length < 2) return [];
  const results: CreatorProfilePeriodChange[] = [];
  for (let i = 1; i < trend.length; i++) {
    const prev = trend[i - 1]!;
    const curr = trend[i]!;
    const viewsChangePct =
      prev.totalViews > 0
        ? Math.round(((curr.totalViews - prev.totalViews) / prev.totalViews) * 1000) / 10
        : curr.totalViews > 0
          ? 100
          : 0;
    const engagementChangePct =
      prev.totalEngagement > 0
        ? Math.round(
            ((curr.totalEngagement - prev.totalEngagement) / prev.totalEngagement) * 1000,
          ) / 10
        : curr.totalEngagement > 0
          ? 100
          : 0;
    results.push({
      period: curr.period,
      viewsChangePct,
      engagementChangePct,
      videoCount: curr.videoCount,
    });
  }
  return results.slice(-6);
}

function categoryTrend(
  category: string,
  videos: VideoWithMetrics[],
): CreatorProfileCategory['trend'] {
  const categoryVideos = videos.filter((v) => v.contentCategory === category);
  if (categoryVideos.length < 2) return 'unknown';

  const midpoint = Date.now() - (PERIOD_DAYS / 2) * 24 * 60 * 60 * 1000;
  const recent = categoryVideos.filter((v) => new Date(v.publishedAt).getTime() >= midpoint);
  const older = categoryVideos.filter((v) => new Date(v.publishedAt).getTime() < midpoint);
  if (recent.length === 0 || older.length === 0) return 'unknown';

  const recentAvg = recent.reduce((s, v) => s + v.views, 0) / recent.length;
  const olderAvg = older.reduce((s, v) => s + v.views, 0) / older.length;
  if (recentAvg > olderAvg * 1.15) return 'rising';
  if (recentAvg < olderAvg * 0.85) return 'declining';
  return 'stable';
}

function mapCategories(
  dashboardCategories: Array<{
    key: string;
    videoCount: number;
    avgViews: number;
    avgEngagementRate: number;
    performanceIndex: number;
  }>,
  videos: VideoWithMetrics[],
): CreatorProfileCategory[] {
  return dashboardCategories.map((c) => ({
    category: c.key,
    videoCount: c.videoCount,
    avgViews: c.avgViews,
    avgEngagementRate: c.avgEngagementRate,
    performanceIndex: c.performanceIndex,
    trend: categoryTrend(c.key, videos),
  }));
}

function mapDeclines(
  underperformers: Array<{
    label: string;
    dimensions: Record<string, string>;
    performanceIndex: number;
    avgViews: number;
    videoCount: number;
  }>,
): CreatorProfileDecline[] {
  return underperformers.slice(0, 8).map((card) => {
    const dimension = Object.keys(card.dimensions)[0] ?? 'pattern';
    const value = Object.values(card.dimensions)[0] ?? card.label;
    return {
      dimension,
      value,
      performanceIndex: card.performanceIndex,
      avgViews: card.avgViews,
      videoCount: card.videoCount,
    };
  });
}

function toVideoWithMetricsFromDashboard(
  dashboard: Awaited<ReturnType<typeof computePlatformDashboard>>,
  videos: VideoWithMetrics[],
): VideoWithMetrics[] {
  if (videos.length > 0) return videos;
  return dashboard.topVideos;
}

export async function buildCreatorStrategistProfile(): Promise<CreatorStrategistProfile | null> {
  await resolveDefaultTikTokCreatorAccountId();
  const tiktokCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
  const { account: loadedAccount, videos: rawVideos } = await loadVideosWithLatestMetrics('tiktok');
  const videos = filterVideosForDisplay(rawVideos, tiktokCtx);

  const [dashboard, businessIntel, connectors] = await Promise.all([
    computePlatformDashboard('tiktok', env.DEMO_MODE),
    computeVideoBusinessIntelligence({ tableLimit: 15, recentLimit: 10 }),
    listAnalyticsConnectors(),
  ]);

  const account = dashboard.account ?? loadedAccount;
  if (!account) return null;

  const medianViews = dashboard.summary.medianViews;
  const allVideos = toVideoWithMetricsFromDashboard(dashboard, videos);
  const recent30 = videosInLastDays(allVideos, PERIOD_DAYS);
  const views30d = recent30.reduce((sum, v) => sum + v.views, 0);

  let savedPosting = await loadPostingTimeAnalytics(account.id, 'tiktok');
  if (!savedPosting) {
    savedPosting = await refreshPostingTimeAnalytics({
      creatorId: account.id,
      platform: 'tiktok',
      demoMode: env.DEMO_MODE,
    });
  }

  const postingTimes = savedPosting
    ? slotsToPostingTimes(savedPosting.byWeekdayHour.slice(0, 10))
    : [];
  const bestPostingDays = savedPosting?.byWeekday.slice(0, 7) ?? [];
  const recommendedPostTimes = savedPosting?.recommendedSlots ?? [];
  const avoidPostTimes = savedPosting?.avoidSlots ?? [];

  const growth: CreatorProfileTrendPoint[] = dashboard.growthTrend.map((p) => ({
    period: p.period,
    totalViews: p.totalViews,
    totalEngagement: p.totalEngagement,
    videoCount: p.videoCount,
  }));
  const engagement: CreatorProfileTrendPoint[] = dashboard.engagementTrend.map((p) => ({
    period: p.period,
    totalViews: p.totalViews,
    totalEngagement: p.totalEngagement,
    videoCount: p.videoCount,
  }));

  const totalMentions = businessIntel.summary.totalMentions || 1;
  const businessMentionFrequency = businessIntel.mostMentionedBusinesses.map((b) => ({
    name: b.businessName,
    mentions: b.videoCount,
    shareOfMentionsPct: Math.round((b.videoCount / totalMentions) * 1000) / 10,
  }));

  const connectedPlatforms = connectors.filter((c) => c.connected).map((c) => c.provider);
  const categories = mapCategories(dashboard.topCategories, allVideos);

  return {
    creator: dashboard.account?.username ?? account.username,
    displayName: resolveCreatorDisplayName({
      displayName: account.displayName ?? dashboard.account?.displayName,
      username: dashboard.account?.username ?? account.username,
      envDisplayName: env.CREATOR_DISPLAY_NAME,
    }),
    creatorId: account.id,
    platform: dashboard.platform,
    dataSource: dashboard.dataSource,
    periodDays: PERIOD_DAYS,
    views30d,
    engagementRate: dashboard.summary.avgEngagementRate,
    postingFrequency: computePostingFrequency(allVideos),
    bestPostingDays,
    postingTimes,
    recommendedPostTimes,
    avoidPostTimes,
    postingTimeAnalytics: savedPosting
      ? {
          computedAt: savedPosting.computedAt,
          timezone: savedPosting.timezone,
          sampleSize: savedPosting.sampleSize,
        }
      : null,
    growthTrend: growth,
    engagementTrend: engagement,
    recentGrowth: computeRecentGrowth(growth),
    recentDeclines: mapDeclines(dashboard.underperformers),
    topCategories: categories.slice(0, 8),
    categoryPerformance: categories,
    topBusinesses: businessIntel.mostMentionedBusinesses.slice(0, 10).map((b) => ({
      name: b.businessName,
      mentions: b.videoCount,
      totalViews: b.totalViews,
      type: b.businessType,
    })),
    sponsorCandidates: businessIntel.topLocalSponsorCandidates.slice(0, 10).map((b) => ({
      name: b.businessName,
      score: b.sponsorScore,
      mentions: b.videoCount,
      totalViews: b.totalViews,
    })),
    businessMentionFrequency: businessMentionFrequency.slice(0, 15),
    audienceSignals: {
      followersAvailable: dashboard.followersAvailable,
      followersCount: dashboard.followersCount,
      connectedPlatforms,
      lastSyncAt: dashboard.connection?.lastSuccessfulSyncAt ?? null,
      scopes: dashboard.connection?.scopes ?? [],
      dataThrough: dashboard.summary.dataThrough,
    },
    summaryStats: {
      totalVideos: dashboard.summary.totalVideos,
      totalViews: dashboard.summary.totalViews,
      medianViews: dashboard.summary.medianViews,
      avgEngagementRate: dashboard.summary.avgEngagementRate,
    },
  };
}
