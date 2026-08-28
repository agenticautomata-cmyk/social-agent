/**
 * Coherent Home analytics snapshot — one follower total, no unexplained cumulative declines.
 */

export type AnalyticsChangeLine = string;

export type CoherentHomeAnalytics = {
  asOf: string | null;
  followers: number | null;
  followerDelta: number | null;
  headline: string | null;
  changes: string[];
  suppressedChanges: string[];
  anomaly: string | null;
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

function extractViewGain(line: string): number | null {
  const m = line.match(VIEWS_DELTA_RE);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? m?.[5];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a compact Home analytics brief from one pulse snapshot + authoritative follower count.
 */
export function buildCoherentHomeAnalytics(input: {
  asOf: string | null;
  authoritativeFollowers: number | null;
  progressSummary?: string | null;
  whatChanged?: string[] | null;
  headline?: string | null;
}): CoherentHomeAnalytics {
  const suppressed: string[] = [];
  const changes: string[] = [];
  let anomaly: string | null = null;
  let followerDelta: number | null = null;

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
    const grew = line.match(FOLLOWERS_GREW_RE);
    if (grew?.[1]) followerDelta = Number(grew[1]);
    changes.push(line);
    if (changes.length >= 3) break;
  }

  // Prefer live studio follower count over prose-extracted totals.
  let followers = input.authoritativeFollowers;
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

  const namedPost = extractNamedPostFromPulse([
    ...(input.headline ? [input.headline] : []),
    ...changes,
    ...(input.progressSummary ? [input.progressSummary] : []),
  ]);
  const postGainLine =
    changes.find((c) => extractNamedPostFromPulse([c]) === namedPost) ??
    changes.find((c) => /video/i.test(c));
  const postGain = postGainLine ? extractViewGain(postGainLine) : null;

  let headline: string | null = null;
  if (namedPost) {
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

  // Compact: drop video-inventory filler from changes when we already have a headline.
  const filtered = changes.filter((c) => !VIDEO_COUNT_RE.test(c) || changes.length <= 1);

  return {
    asOf: input.asOf,
    followers,
    followerDelta,
    headline,
    changes: filtered.slice(0, 3),
    suppressedChanges: suppressed,
    anomaly,
  };
}
