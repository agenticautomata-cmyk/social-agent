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

  let headline = (input.headline ?? '').trim() || null;
  if (followers != null) {
    const deltaBit =
      followerDelta != null && followerDelta !== 0
        ? followerDelta > 0
          ? ` (+${followerDelta} recently)`
          : ` (${followerDelta} recently)`
        : '';
    if (!headline) {
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
