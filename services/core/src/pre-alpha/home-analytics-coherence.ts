/**
 * Coherent Home analytics snapshot — one follower total, no unexplained cumulative declines.
 */

import {
  formatFollowerGrowthLine,
  isAccountWideTotalViewsLine,
  isFollowerGrowthLine,
  HOME_VIDEO_VISIBLE_LIMIT,
  type ComparisonInterval,
  type LatestVideoGrowth,
  type VideoGrowthRow,
} from './home-video-growth.js';

export type AnalyticsChangeLine = string;

export type CoherentHomeAnalytics = {
  asOf: string | null;
  followers: number | null;
  followerDelta: number | null;
  headline: string | null;
  changes: string[];
  overflowChanges: string[];
  followerLine: string | null;
  suppressedChanges: string[];
  anomaly: string | null;
  comparisonInterval: ComparisonInterval | null;
  latestVideoId: string | null;
  videoIds: string[];
};

const TOTAL_VIEWS_DECLINE_RE =
  /total views[^.]*\b(-|decrease|drop|down|change of -)\s*[\d,]+/i;
const FOLLOWERS_TOTAL_RE = /followers?[^.]*\b(?:total(?:ing|led)?|now|to)\s*([\d,]+)/i;
const FOLLOWERS_GREW_RE = /followers?\s+grew\s+by\s+(\d+)/i;
const VIDEO_COUNT_RE = /(\d+)\s+videos?/i;
const QUOTED_VIDEO_RE = /['"]([^'"]{2,80})['"]\s+video\b/i;
const QUOTED_POST_GAIN_RE = /['"]([^'"]{2,80})['"]\s+gained\b/i;
const VIEWS_FROM_QUOTED_RE = /views gained from\s+['"]([^'"]{2,80})['"]/i;
const VIDEO_ON_RE = /\b(?:the\s+)?video on\s+([^,.]+?)(?:\s+increased|\s+gained|,|\.|$)/i;
const NAMED_VIDEO_GAINED_RE = /\b([A-Z][\w &.'-]{1,60}?)\s+video gained\b/i;
const VIEWS_DELTA_RE =
  /gained\s+([\d,]+)\s+views?|increased by\s+([\d,]+)\s+views?|\+(\d+)\s+views?|—\s*up\s+([\d,]+)\b|\bup\s+([\d,]+)\s+to\b/i;

/**
 * Extract a numeric follower total from pulse prose when present.
 */
export function extractFollowerTotalFromPulseText(text: string): number | null {
  const m = text.match(FOLLOWERS_TOTAL_RE);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function isUnexplainedCumulativeViewsDecline(line: string): boolean {
  return TOTAL_VIEWS_DECLINE_RE.test(line);
}

/** Prefer a concrete post title from pulse lines when known. */
export function extractNamedPostFromPulse(lines: string[]): string | null {
  for (const line of lines) {
    const fromViews = line.match(VIEWS_FROM_QUOTED_RE);
    if (fromViews?.[1]) return fromViews[1].trim();
    const quotedGain = line.match(QUOTED_POST_GAIN_RE);
    if (quotedGain?.[1]) return quotedGain[1].trim();
    const quoted = line.match(QUOTED_VIDEO_RE);
    if (quoted?.[1]) return quoted[1].trim();
    const onVideo = line.match(VIDEO_ON_RE);
    if (onVideo?.[1]) return onVideo[1].trim().replace(/^["']|["']$/g, '');
    const named = line.match(NAMED_VIDEO_GAINED_RE);
    if (named?.[1] && !/^the$/i.test(named[1])) return named[1].trim();
  }
  return null;
}

function looksLikeNamedVideoHeadline(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  if (extractNamedPostFromPulse([text])) return true;
  if (isAccountWideTotalViewsLine(text)) return false;
  if (/followers?\b/i.test(text) && /\d/.test(text)) return false;
  return /[A-Za-z]/.test(text) && text.trim().length >= 8;
}

function extractViewGain(line: string): number | null {
  const m = line.match(VIEWS_DELTA_RE);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? m?.[5];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a compact Home analytics brief from one pulse snapshot + authoritative follower count.
 * When `videoGrowth` is present, the named video and view delta always share that video ID.
 */
export function buildCoherentHomeAnalytics(input: {
  asOf: string | null;
  authoritativeFollowers: number | null;
  progressSummary?: string | null;
  whatChanged?: string[] | null;
  headline?: string | null;
  videoGrowth?: LatestVideoGrowth | null;
}): CoherentHomeAnalytics {
  const suppressed: string[] = [];
  const changes: string[] = [];
  let anomaly: string | null = null;
  let followerDelta: number | null = input.videoGrowth?.followerDelta ?? null;
  const growth = input.videoGrowth ?? null;
  const namedHint = Boolean(
    growth?.videoTitle ||
      looksLikeNamedVideoHeadline(input.headline) ||
      extractNamedPostFromPulse([
        ...(input.headline ? [input.headline] : []),
        ...(input.whatChanged ?? []),
        ...(input.progressSummary ? [input.progressSummary] : []),
      ]),
  );

  for (const raw of input.whatChanged ?? []) {
    const line = raw.trim();
    if (!line) continue;
    if (isUnexplainedCumulativeViewsDecline(line)) {
      suppressed.push(line);
      anomaly =
        anomaly ??
        'Lifetime totals dropped vs the prior snapshot — likely a sync correction or removed videos, not ordinary growth.';
      continue;
    }
    if (namedHint && isAccountWideTotalViewsLine(line)) {
      suppressed.push(line);
      continue;
    }
    const grew = line.match(FOLLOWERS_GREW_RE);
    if (grew?.[1] && followerDelta == null) followerDelta = Number(grew[1]);
    changes.push(line);
    if (changes.length >= 3) break;
  }

  // Prefer live studio follower count over prose-extracted totals.
  let followers = input.authoritativeFollowers;
  if (followers == null && growth?.followers != null) {
    followers = growth.followers;
  }
  if (followers == null && input.progressSummary) {
    followers = extractFollowerTotalFromPulseText(input.progressSummary);
  }
  // If pulse prose disagrees with authoritative count, trust authoritative and note it.
  if (
    followers != null &&
    input.progressSummary &&
    extractFollowerTotalFromPulseText(input.progressSummary) != null &&
    extractFollowerTotalFromPulseText(input.progressSummary) !== followers
  ) {
    anomaly =
      anomaly ??
      'Follower totals in the pulse narrative disagreed with the live analytics snapshot; Home uses the live count.';
  }

  const namedPost =
    growth?.videoTitle ??
    extractNamedPostFromPulse([
      ...(input.headline ? [input.headline] : []),
      ...changes,
      ...(input.progressSummary ? [input.progressSummary] : []),
    ]) ??
    (looksLikeNamedVideoHeadline(input.headline) ? input.headline!.trim() : null);
  const postGainLine =
    changes.find((c) => extractNamedPostFromPulse([c]) === namedPost) ??
    changes.find((c) => /video/i.test(c) && !isAccountWideTotalViewsLine(c));
  const postGain = growth?.viewDelta ?? (postGainLine ? extractViewGain(postGainLine) : null);

  let headline: string | null = null;
  if (growth?.headline) {
    headline = growth.headline;
  } else if (namedPost) {
    headline =
      postGain != null && postGain > 0
        ? `“${namedPost}” picked up ${postGain.toLocaleString()} views`
        : `“${namedPost}” is moving`;
  } else {
    headline = (input.headline ?? '').trim() || null;
    if (followers != null && !headline) {
      const deltaBit =
        followerDelta != null && followerDelta !== 0
          ? followerDelta > 0
            ? ` (+${followerDelta} recently)`
            : ` (${followerDelta} recently)`
          : '';
      headline = `${followers.toLocaleString()} followers${deltaBit}`;
    }
  }

  // Prefer structured posting-batch lines when present.
  const growthVideos: VideoGrowthRow[] = growth?.videos ?? [];
  const videoLines = growthVideos.map((v) => v.line);
  const visibleVideoLines = videoLines.slice(0, HOME_VIDEO_VISIBLE_LIMIT);
  const overflowChanges = growth?.overflowLines?.length
    ? growth.overflowLines
    : videoLines.slice(HOME_VIDEO_VISIBLE_LIMIT);
  const followerLine =
    followerDelta != null && followerDelta > 0 && followers != null
      ? formatFollowerGrowthLine(followerDelta, followers)
      : growth?.followerLine ?? null;

  const fromGrowth = visibleVideoLines.filter((c) => !isFollowerGrowthLine(c));
  const structuredVideoBrief = Boolean(growth && (growth.empty || growthVideos.length > 0));
  const fromPulse = changes.filter((c) => {
    if (fromGrowth.includes(c)) return false;
    if (isFollowerGrowthLine(c)) return false;
    if (followerDelta != null && FOLLOWERS_GREW_RE.test(c)) return false;
    if (growthVideos.length > 0 && /\bviews?\b/i.test(c)) return false;
    if (growth?.videoId && /\bviews?\b/i.test(c)) return false;
    return true;
  });
  const withoutAccountTotals = [
    ...(structuredVideoBrief ? fromGrowth : [...fromGrowth, ...fromPulse]),
  ].filter((c) => {
    if (VIDEO_COUNT_RE.test(c) && (fromGrowth.length || changes.length) > 1) return false;
    if (namedPost && isAccountWideTotalViewsLine(c)) return false;
    if (headline && c === headline) return false;
    if (isFollowerGrowthLine(c)) return false;
    return true;
  });

  return {
    asOf: input.asOf,
    followers,
    followerDelta,
    headline,
    changes: withoutAccountTotals,
    overflowChanges,
    followerLine,
    suppressedChanges: suppressed,
    anomaly,
    comparisonInterval: growth?.comparisonInterval ?? null,
    latestVideoId: growth?.videoId ?? null,
    videoIds: growthVideos.map((v) => v.videoId),
  };
}
