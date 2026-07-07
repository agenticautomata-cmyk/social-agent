import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPostingAnalytics, type Platform } from '../schema.js';
import { env } from '../env.js';
import { loadVideosWithLatestMetrics } from './dashboard.js';
import { getCreatorTimezone, timezoneShortLabel } from '../datetime.js';
import { weekdayBucket } from './parse.js';
import { filterVideosForDisplay, resolveTikTokAnalyticsContext } from './tiktok-context.js';
import type { VideoWithMetrics } from './types.js';

export type PostingTimeSlotAnalytics = {
  weekday: string;
  hour: number;
  minute: number;
  timezone: string;
  label: string;
  videoCount: number;
  avgViews: number;
  avgEngagementRate: number;
  performanceIndex: number;
};

export type PostingTimeBucketAnalytics = {
  bucket: string;
  videoCount: number;
  avgViews: number;
  performanceIndex: number;
};

export type SavedPostingTimeAnalytics = {
  computedAt: string;
  timezone: string;
  sampleSize: number;
  medianViews: number;
  byWeekday: PostingTimeBucketAnalytics[];
  byWeekdayHour: PostingTimeSlotAnalytics[];
  recommendedSlots: PostingTimeSlotAnalytics[];
  avoidSlots: PostingTimeSlotAnalytics[];
};

type LocalPostParts = {
  weekday: string;
  hour: number;
  minute: number;
};

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

function localPostParts(iso: string, timezone: string): LocalPostParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(iso));

  return {
    weekday: parts.find((p) => p.type === 'weekday')?.value ?? 'Unknown',
    hour: Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10),
    minute: Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10),
  };
}

function formatSlotLabel(
  weekday: string,
  hour: number,
  minute: number,
  timezone: string,
  referenceDate = new Date(),
): string {
  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const minStr = minute > 0 ? `:${minute.toString().padStart(2, '0')}` : '';
  const abbr = timezoneShortLabel(timezone, referenceDate);
  return `${weekday} ${h12}${minStr} ${ampm} ${abbr}`;
}

function slotKey(parts: LocalPostParts): string {
  return `${parts.weekday}|${parts.hour}`;
}

function rollupWeekdayBuckets(
  videos: VideoWithMetrics[],
  timezone: string,
  medianViews: number,
): PostingTimeBucketAnalytics[] {
  const groups = new Map<string, VideoWithMetrics[]>();
  for (const video of videos) {
    const key = weekdayBucket(new Date(video.publishedAt), timezone);
    const list = groups.get(key) ?? [];
    list.push(video);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([bucket, items]) => {
      const avgViews = avg(items.map((v) => v.views));
      return {
        bucket,
        videoCount: items.length,
        avgViews: Math.round(avgViews),
        performanceIndex:
          medianViews > 0 ? Math.round((avgViews / medianViews) * 100) / 100 : 1,
      };
    })
    .sort((a, b) => b.performanceIndex - a.performanceIndex || b.avgViews - a.avgViews);
}

function computeWeekdayHourSlots(
  videos: VideoWithMetrics[],
  timezone: string,
  medianViews: number,
): PostingTimeSlotAnalytics[] {
  const groups = new Map<string, { items: VideoWithMetrics[]; weekday: string; hour: number }>();

  for (const video of videos) {
    const parts = localPostParts(video.publishedAt, timezone);
    const key = slotKey(parts);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(video);
    } else {
      groups.set(key, { items: [video], weekday: parts.weekday, hour: parts.hour });
    }
  }

  return [...groups.values()]
    .map(({ items, weekday, hour }) => {
      const minutes = items.map((v) => localPostParts(v.publishedAt, timezone).minute);
      const minute = median(minutes);
      const avgViews = avg(items.map((v) => v.views));
      const avgEngagementRate = avg(items.map((v) => v.engagementRate));
      const referenceDate = new Date(items[0]!.publishedAt);
      return {
        weekday,
        hour,
        minute,
        timezone,
        label: formatSlotLabel(weekday, hour, minute, timezone, referenceDate),
        videoCount: items.length,
        avgViews: Math.round(avgViews),
        avgEngagementRate: Math.round(avgEngagementRate * 10000) / 10000,
        performanceIndex:
          medianViews > 0 ? Math.round((avgViews / medianViews) * 100) / 100 : 1,
      };
    })
    .sort((a, b) => b.performanceIndex - a.performanceIndex || b.avgViews - a.avgViews);
}

export function computePostingTimeAnalytics(
  videos: VideoWithMetrics[],
  timezone = getCreatorTimezone(),
): SavedPostingTimeAnalytics {
  const viewCounts = videos.map((v) => v.views);
  const medianViews = median(viewCounts);
  const byWeekdayHour = computeWeekdayHourSlots(videos, timezone, medianViews);
  const byWeekday = rollupWeekdayBuckets(videos, timezone, medianViews);

  const recommendedSlots = byWeekdayHour
    .filter((slot) => slot.videoCount >= 2 && slot.performanceIndex >= 1)
    .slice(0, 5);

  const fallbackRecommended =
    recommendedSlots.length > 0
      ? recommendedSlots
      : byWeekdayHour.filter((slot) => slot.performanceIndex >= 1).slice(0, 3);

  const avoidSlots = byWeekdayHour
    .filter((slot) => slot.videoCount >= 2 && slot.performanceIndex < 0.75)
    .sort((a, b) => a.performanceIndex - b.performanceIndex)
    .slice(0, 5);

  return {
    computedAt: new Date().toISOString(),
    timezone,
    sampleSize: videos.length,
    medianViews,
    byWeekday,
    byWeekdayHour,
    recommendedSlots: fallbackRecommended,
    avoidSlots,
  };
}

export async function savePostingTimeAnalytics(
  creatorId: string,
  platform: Platform,
  analytics: SavedPostingTimeAnalytics,
): Promise<void> {
  await db
    .insert(creatorPostingAnalytics)
    .values({
      creatorId,
      platform,
      computedAt: new Date(analytics.computedAt),
      timezone: analytics.timezone,
      sampleSize: analytics.sampleSize,
      medianViews: analytics.medianViews,
      analytics,
    })
    .onConflictDoUpdate({
      target: [creatorPostingAnalytics.creatorId, creatorPostingAnalytics.platform],
      set: {
        computedAt: new Date(analytics.computedAt),
        timezone: analytics.timezone,
        sampleSize: analytics.sampleSize,
        medianViews: analytics.medianViews,
        analytics,
      },
    });
}

export async function loadPostingTimeAnalytics(
  creatorId: string,
  platform: Platform,
): Promise<SavedPostingTimeAnalytics | null> {
  const [row] = await db
    .select({ analytics: creatorPostingAnalytics.analytics })
    .from(creatorPostingAnalytics)
    .where(
      and(
        eq(creatorPostingAnalytics.creatorId, creatorId),
        eq(creatorPostingAnalytics.platform, platform),
      ),
    )
    .limit(1);

  if (!row) return null;
  return row.analytics as SavedPostingTimeAnalytics;
}

export async function refreshPostingTimeAnalytics(options: {
  creatorId: string;
  platform: Platform;
  demoMode?: boolean;
}): Promise<SavedPostingTimeAnalytics | null> {
  const demoMode = options.demoMode ?? env.DEMO_MODE;
  const timezone = getCreatorTimezone();

  let { videos } = await loadVideosWithLatestMetrics(options.platform);
  if (options.platform === 'tiktok') {
    const tiktokCtx = await resolveTikTokAnalyticsContext(demoMode);
    videos = filterVideosForDisplay(videos, tiktokCtx);
  }

  if (videos.length === 0) return null;

  const analytics = computePostingTimeAnalytics(videos, timezone);
  await savePostingTimeAnalytics(options.creatorId, options.platform, analytics);
  return analytics;
}
