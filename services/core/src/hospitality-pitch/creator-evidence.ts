/**
 * The real audience evidence a pitch is allowed to use.
 *
 * The previous pipeline had two compounding faults. The voice rules *required* the
 * model to write "over 5K followers" and banned real counts, and `sanitizeOutreachEmail`
 * then rewrote any real number back into that band. Kellie has 6,704 followers, so the
 * system was understating her by a third and sounding vague while doing it. Worse, when
 * analytics failed to resolve, `buildPitchContext` fell back to the literal string
 * "over 5K followers" — an unverified claim invented by the code.
 *
 * The rule here: a pitch states real, resolved numbers, or it says nothing about reach
 * and the send-readiness gate blocks it. There is no band and no fallback.
 */

import { sql } from 'drizzle-orm';

import { db } from '../db.js';
import { env } from '../env.js';
import { resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { formatTikTokHandle } from '../creator-display.js';

/** Analytics older than this are stale — a hotel should not be quoted last quarter's reach. */
export const ANALYTICS_STALE_DAYS = 14;

export type PitchAudienceEvidence = {
  platform: 'TikTok';
  handle: string | null;
  /** Real resolved follower count. Null means unavailable — never a band, never a guess. */
  followersCount: number | null;
  followersAvailable: boolean;
  lastSyncedAt: string | null;
  stale: boolean;
  /** Aggregates over the videos Benson actually has metrics for. */
  postsWithMetrics: number;
  totalViews: number | null;
  totalEngagement: number | null;
  medianViewsPerPost: number | null;
  /** Engagement as a share of views, when both are known. */
  engagementRatePercent: number | null;
  /** Sentences a pitch may use verbatim. Empty when nothing is verified. */
  usableClaims: string[];
  /** Why reach cannot be described, when it cannot. */
  unavailableReason: string | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/**
 * Resolves audience evidence from the authoritative connector.
 *
 * Only TikTok is used. Instagram and Facebook have been stale since 2026-06-01 and
 * YouTube was never connected, so a pitch must simply not mention them rather than
 * quote a number from June as if it were current.
 */
export async function resolvePitchAudienceEvidence(): Promise<PitchAudienceEvidence> {
  const ctx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
  const handle = formatTikTokHandle(ctx.platformUsername) ?? null;
  const lastSyncedAt = ctx.lastSuccessfulSyncAt ?? ctx.lastSyncAt ?? null;

  const ageDays = lastSyncedAt
    ? (Date.now() - new Date(lastSyncedAt).getTime()) / 86_400_000
    : null;
  const stale = ageDays !== null && ageDays > ANALYTICS_STALE_DAYS;

  // Demo data must never reach a real business.
  const followersAvailable =
    ctx.followersAvailable &&
    ctx.followersCount !== null &&
    ctx.followersSource === 'tiktok_api' &&
    !ctx.effectiveDemoMode;

  const perVideo = await latestMetricsPerVideo();
  const views = perVideo.map((v) => v.views).filter((n): n is number => n !== null);
  const engagements = perVideo
    .map((v) => v.engagement)
    .filter((n): n is number => n !== null);

  const totalViews = views.length > 0 ? views.reduce((a, b) => a + b, 0) : null;
  const totalEngagement =
    engagements.length > 0 ? engagements.reduce((a, b) => a + b, 0) : null;
  const medianViewsPerPost = median(views);
  const engagementRatePercent =
    totalViews && totalViews > 0 && totalEngagement !== null
      ? Math.round((totalEngagement / totalViews) * 1000) / 10
      : null;

  const usableClaims: string[] = [];
  let unavailableReason: string | null = null;

  if (!followersAvailable) {
    unavailableReason = ctx.effectiveDemoMode
      ? 'Analytics are in demo mode, so no real audience numbers are available.'
      : 'The TikTok connector has not returned a follower count, so Kellie\u2019s reach cannot be stated.';
  } else if (stale) {
    unavailableReason = `The TikTok connector last synced ${Math.round(ageDays!)} days ago, so these numbers are stale.`;
  } else {
    if (handle) {
      usableClaims.push(
        `${handle} on TikTok, ${ctx.followersCount!.toLocaleString('en-US')} followers`,
      );
    }
    if (medianViewsPerPost !== null && perVideo.length >= 10) {
      usableClaims.push(
        `a typical post lands around ${medianViewsPerPost.toLocaleString('en-US')} views`,
      );
    }
    if (totalViews !== null && totalViews > 0 && perVideo.length >= 10) {
      usableClaims.push(
        `${totalViews.toLocaleString('en-US')} total views across ${perVideo.length} posts Benson has metrics for`,
      );
    }
    if (engagementRatePercent !== null && engagementRatePercent > 0) {
      usableClaims.push(`about ${engagementRatePercent}% engagement against views`);
    }
  }

  return {
    platform: 'TikTok',
    handle,
    followersCount: followersAvailable ? ctx.followersCount : null,
    followersAvailable,
    lastSyncedAt,
    stale,
    postsWithMetrics: perVideo.length,
    totalViews,
    totalEngagement,
    medianViewsPerPost,
    engagementRatePercent,
    usableClaims,
    unavailableReason,
  };
}

/**
 * The newest snapshot per video.
 *
 * `creator_metrics_snapshots` holds 890k rows across the video history, so taking the
 * latest row per video is the only way to avoid counting the same video's views once
 * per sync. A stale duplicate `@kelliekc` connector mirrors 140 of the real videos,
 * which is why this is keyed on the video row rather than on the platform video id.
 */
async function latestMetricsPerVideo(): Promise<
  Array<{ views: number | null; engagement: number | null }>
> {
  // Deduplicated in the database rather than 890k rows through the process.
  //
  // The grouping key is the PLATFORM video id, not `creator_videos.id`. A stale
  // `@kelliekc` import-only account mirrors 140 of the 251 videos on the real
  // `@kckellie` OAuth connector, so grouping by row id counted those twice and
  // reported 1,810,391 total views against a true 1.17M — a 55% overstatement that
  // would have gone into a pitch as fact. Demo videos are excluded by id prefix, and
  // the OAuth-connected account wins any remaining tie.
  const rows = await db.execute<{
    views: string | number | null;
    engagement: string | number | null;
  }>(sql`
    SELECT DISTINCT ON (v.video_id)
      s.views,
      (s.likes + s.comments + s.shares) AS engagement
    FROM creator_metrics_snapshots s
    JOIN creator_videos v ON v.id = s.video_id
    JOIN creator_accounts a ON a.id = v.account_id
    WHERE v.platform = 'tiktok'
      AND v.video_id NOT LIKE 'demo_tt_%'
      AND s.views > 0
    ORDER BY
      v.video_id,
      (a.connection_status = 'oauth_connected') DESC,
      s.collected_at DESC
  `);

  const list = rows as unknown as Array<{
    views: string | number | null;
    engagement: string | number | null;
  }>;
  return list.map((row) => ({
    views: toNumber(row.views),
    engagement: toNumber(row.engagement),
  }));
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Formats the audience paragraph a pitch may include. Returns null when there is
 * nothing verified to say, which is a blocked state rather than a licence to be vague.
 */
export function formatAudienceLine(evidence: PitchAudienceEvidence): string | null {
  if (evidence.usableClaims.length === 0) return null;
  const [identity, ...rest] = evidence.usableClaims;
  if (rest.length === 0) return `I'm ${identity}.`;
  return `I'm ${identity} — ${rest.slice(0, 2).join(', and ')}.`;
}
