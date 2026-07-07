import { loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import { filterVideosForDisplay, resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { refreshPostingTimeAnalytics } from '../creator-analytics/posting-times.js';
import { env } from '../env.js';
import { resolveOperatorCreatorId } from './resolve-creator.js';
import type { VideoWithMetrics } from '../creator-analytics/types.js';
import type { AccountBaselines, OperatorPerformanceSignals, OperatorVideoRef } from './types.js';

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

export function toOperatorVideoRef(v: VideoWithMetrics): OperatorVideoRef {
  return {
    id: v.id,
    videoId: v.videoId,
    title: v.title,
    caption: v.caption,
    postUrl: v.postUrl,
    thumbnailUrl: v.thumbnailUrl,
    publishedAt: v.publishedAt,
    contentCategory: v.contentCategory,
    contentPillar: v.contentPillar,
    locationTag: v.locationTag,
    sponsorTag: v.sponsorTag,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    engagementRate: v.engagementRate,
    performanceIndex: v.performanceIndex,
  };
}

export async function loadAccountBaselines(): Promise<AccountBaselines> {
  const tiktokCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
  let { videos } = await loadVideosWithLatestMetrics('tiktok');
  videos = filterVideosForDisplay(videos, tiktokCtx);

  const viewCounts = videos.map((v) => v.views);
  return {
    medianViews: median(viewCounts),
    avgViews: avg(viewCounts),
    avgEngagementRate: avg(videos.map((v) => v.engagementRate)),
    avgComments: avg(videos.map((v) => v.comments)),
    avgShares: avg(videos.map((v) => v.shares)),
    videos,
  };
}

export function isOutperformer(
  video: VideoWithMetrics,
  baselines: AccountBaselines,
  threshold = 1.5,
): boolean {
  if (baselines.medianViews <= 0) return video.views > 1000;
  return (
    video.performanceIndex >= threshold ||
    (video.engagementRate > baselines.avgEngagementRate * 1.3 && video.views >= 500)
  );
}

export function isMomentumFading(video: VideoWithMetrics, baselines: AccountBaselines): boolean {
  const ageMs = Date.now() - new Date(video.publishedAt).getTime();
  const withinWeek = ageMs <= 7 * 24 * 60 * 60 * 1000;
  return withinWeek && video.performanceIndex < 0.6 && video.views < baselines.medianViews * 0.5;
}

export function isRecentStrong(video: VideoWithMetrics, baselines: AccountBaselines): boolean {
  const ageMs = Date.now() - new Date(video.publishedAt).getTime();
  const within72h = ageMs <= 72 * 60 * 60 * 1000;
  return within72h && isOutperformer(video, baselines, 1.3);
}

/** Older outperformers worth recycling with a fresh hook, caption, and sound. */
export function isRecyclingCandidate(
  video: VideoWithMetrics,
  baselines: AccountBaselines,
): boolean {
  const ageMs = Date.now() - new Date(video.publishedAt).getTime();
  const minAge = 21 * 24 * 60 * 60 * 1000;
  const maxAge = 120 * 24 * 60 * 60 * 1000;
  return ageMs >= minAge && ageMs <= maxAge && isOutperformer(video, baselines, 1.15);
}

export function hasHighCommentVelocity(video: VideoWithMetrics, baselines: AccountBaselines): boolean {
  return video.comments >= Math.max(10, baselines.avgComments * 2);
}

export async function computePerformanceSignals(
  baselines: AccountBaselines,
): Promise<OperatorPerformanceSignals> {
  const themeMap = new Map<string, { total: number; count: number }>();
  for (const v of baselines.videos) {
    const key = v.contentCategory ?? v.contentPillar ?? 'general';
    const cur = themeMap.get(key) ?? { total: 0, count: 0 };
    cur.total += v.performanceIndex;
    cur.count += 1;
    themeMap.set(key, cur);
  }

  const topThemes = [...themeMap.entries()]
    .map(([key, { total, count }]) => ({
      key,
      performanceIndex: Math.round((total / count) * 100) / 100,
      videoCount: count,
    }))
    .sort((a, b) => b.performanceIndex - a.performanceIndex)
    .slice(0, 5);

  let bestPostingWindows: Array<{ label: string; performanceIndex: number }> = [];
  try {
    const creatorId = await resolveOperatorCreatorId();
    const posting = await refreshPostingTimeAnalytics({
      creatorId,
      platform: 'tiktok',
      demoMode: env.DEMO_MODE,
    });
    bestPostingWindows = (posting?.recommendedSlots ?? []).slice(0, 4).map((s) => ({
      label: s.label,
      performanceIndex: s.performanceIndex,
    }));
  } catch {
    bestPostingWindows = [];
  }

  const outperformers = baselines.videos.filter((v) => isOutperformer(v, baselines));
  const fading = baselines.videos.filter((v) => isMomentumFading(v, baselines));

  return {
    medianViews: baselines.medianViews,
    avgEngagementRate: Math.round(baselines.avgEngagementRate * 10000) / 10000,
    totalVideos: baselines.videos.length,
    outperformingCount: outperformers.length,
    needsFollowUpCount: baselines.videos.filter(
      (v) => isOutperformer(v, baselines) || hasHighCommentVelocity(v, baselines),
    ).length,
    sponsorProofCandidates: outperformers.filter((v) => v.views >= 1000).length,
    momentumFadingCount: fading.length,
    topThemes,
    bestPostingWindows,
  };
}
