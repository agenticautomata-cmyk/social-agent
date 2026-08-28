/**
 * Per-video Home growth briefing — latest published TikTok vs two compatible snapshots.
 * Never attributes account-wide total-view growth to a named video.
 */

export type GrowthVideoSnapshot = {
  videoId: string;
  title: string;
  views: number;
  publishedAt: string;
};

export type GrowthAccountSnapshot = {
  capturedAt: string;
  followers: number | null;
  totalViews: number;
  totalVideos: number;
  recentVideos: GrowthVideoSnapshot[];
  successful?: boolean;
};

export type SnapshotCompatibility = {
  ok: boolean;
  reason: string | null;
};

export type ComparisonInterval = {
  from: string;
  to: string;
};

export type LatestVideoGrowth = {
  videoId: string | null;
  videoTitle: string | null;
  publishedAt: string | null;
  currentViews: number | null;
  previousViews: number | null;
  viewDelta: number | null;
  firstTracked: boolean;
  followers: number | null;
  followerDelta: number | null;
  comparisonInterval: ComparisonInterval | null;
  compatible: boolean;
  incompatibilityReason: string | null;
  headline: string | null;
  lines: string[];
};

const CATALOG_VIEW_DROP_ABS = 1_000;
const CATALOG_VIEW_DROP_RATIO = 0.05;
const MIN_OVERLAP_DENOM = 3;
const MIN_OVERLAP_RATIO = 0.4;

export function isAccountWideTotalViewsLine(line: string): boolean {
  return /total views?\b/i.test(line);
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function asVideo(raw: unknown): GrowthVideoSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.videoId !== 'string' || !v.videoId.trim()) return null;
  if (typeof v.publishedAt !== 'string' || parseIsoMs(v.publishedAt) == null) return null;
  const views = typeof v.views === 'number' && Number.isFinite(v.views) ? v.views : null;
  if (views == null || views < 0) return null;
  const title =
    typeof v.title === 'string' && v.title.trim()
      ? v.title.trim()
      : 'Untitled';
  return { videoId: v.videoId.trim(), title, views, publishedAt: v.publishedAt };
}

export function asGrowthAccountSnapshot(raw: unknown): GrowthAccountSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.capturedAt !== 'string' || parseIsoMs(s.capturedAt) == null) return null;
  if (!Array.isArray(s.recentVideos)) return null;
  const recentVideos = s.recentVideos.map(asVideo).filter((v): v is GrowthVideoSnapshot => v != null);
  return {
    capturedAt: s.capturedAt,
    followers: typeof s.followers === 'number' && Number.isFinite(s.followers) ? s.followers : null,
    totalViews: typeof s.totalViews === 'number' && Number.isFinite(s.totalViews) ? s.totalViews : 0,
    totalVideos:
      typeof s.totalVideos === 'number' && Number.isFinite(s.totalVideos)
        ? s.totalVideos
        : recentVideos.length,
    recentVideos,
    successful: s.successful === false ? false : true,
  };
}

/** Latest published video by publication timestamp, not by view gain. */
export function selectLatestPublishedVideo(
  videos: GrowthVideoSnapshot[],
): GrowthVideoSnapshot | null {
  let latest: GrowthVideoSnapshot | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const video of videos) {
    const ms = parseIsoMs(video.publishedAt);
    if (ms == null) continue;
    if (
      ms > latestMs ||
      (ms === latestMs && latest != null && video.videoId.localeCompare(latest.videoId) > 0)
    ) {
      latest = video;
      latestMs = ms;
    }
  }
  return latest;
}

export function areSnapshotsCompatible(
  current: GrowthAccountSnapshot | null,
  previous: GrowthAccountSnapshot | null,
): SnapshotCompatibility {
  if (!current || !previous) return { ok: false, reason: 'missing_snapshot' };
  if (current.successful === false || previous.successful === false) {
    return { ok: false, reason: 'unsuccessful_snapshot' };
  }
  const currentMs = parseIsoMs(current.capturedAt);
  const previousMs = parseIsoMs(previous.capturedAt);
  if (currentMs == null || previousMs == null) return { ok: false, reason: 'missing_snapshot' };
  if (previousMs >= currentMs) return { ok: false, reason: 'out_of_order' };

  if (previous.totalViews > 0) {
    const drop = previous.totalViews - current.totalViews;
    if (drop >= CATALOG_VIEW_DROP_ABS && drop / previous.totalViews > CATALOG_VIEW_DROP_RATIO) {
      return { ok: false, reason: 'incompatible_catalog' };
    }
  }

  const prevIds = new Set(previous.recentVideos.map((v) => v.videoId));
  const overlap = current.recentVideos.filter((v) => prevIds.has(v.videoId)).length;
  const denom = Math.min(prevIds.size, current.recentVideos.length);
  if (denom >= MIN_OVERLAP_DENOM && overlap / denom < MIN_OVERLAP_RATIO) {
    return { ok: false, reason: 'incompatible_catalog' };
  }

  return { ok: true, reason: null };
}

/** Newest-first list → latest successful snapshot plus the next compatible predecessor. */
export function pickCompatibleSnapshotPair(
  newestFirst: Array<GrowthAccountSnapshot | null | undefined>,
): {
  current: GrowthAccountSnapshot | null;
  previous: GrowthAccountSnapshot | null;
  incompatibilityReason: string | null;
} {
  const usable = newestFirst.filter((s): s is GrowthAccountSnapshot => {
    return Boolean(s && s.successful !== false && s.recentVideos.length > 0);
  });
  const current = usable[0] ?? null;
  if (!current) {
    return { current: null, previous: null, incompatibilityReason: 'missing_snapshot' };
  }

  let lastReason: string | null = 'missing_snapshot';
  for (let i = 1; i < usable.length; i++) {
    const candidate = usable[i]!;
    const compat = areSnapshotsCompatible(current, candidate);
    if (compat.ok) {
      return { current, previous: candidate, incompatibilityReason: null };
    }
    lastReason = compat.reason;
  }
  return { current, previous: null, incompatibilityReason: lastReason };
}

function formatGain(n: number): string {
  return n.toLocaleString('en-US');
}

/** Operator-facing title: first sentence, strip hashtags, keep it short. */
export function displayVideoTitle(title: string, max = 72): string {
  const firstLine = title.split(/\n/)[0]?.trim() || title.trim() || 'Untitled';
  const withoutTags = firstLine.replace(/\s+#[\w.]+(?:\s+#[\w.]+)*\s*$/g, '').trim() || firstLine;
  const sentence = withoutTags.split(/(?<=[.!?])\s+/)[0]?.trim() || withoutTags;
  const emojiTrimmed = sentence.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*$/gu, '').trim() || sentence;
  if (emojiTrimmed.length <= max) return emojiTrimmed;
  return `${emojiTrimmed.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function formatVideoGrowthLine(input: {
  title: string;
  viewDelta: number;
  firstTracked: boolean;
}): string {
  const title = displayVideoTitle(input.title);
  if (input.firstTracked) {
    return `“${title}” gained ${formatGain(input.viewDelta)} views. Since first tracked.`;
  }
  return `“${title}” gained ${formatGain(input.viewDelta)} views since the last check.`;
}

export function formatFollowerGrowthLine(delta: number, total: number): string {
  const unit = delta === 1 ? 'follower' : 'followers';
  return `You gained ${formatGain(delta)} ${unit}, bringing the total to ${formatGain(total)}.`;
}

export function emptyLatestVideoGrowth(
  overrides: Partial<LatestVideoGrowth> = {},
): LatestVideoGrowth {
  return {
    videoId: null,
    videoTitle: null,
    publishedAt: null,
    currentViews: null,
    previousViews: null,
    viewDelta: null,
    firstTracked: false,
    followers: null,
    followerDelta: null,
    comparisonInterval: null,
    compatible: false,
    incompatibilityReason: 'missing_snapshot',
    headline: null,
    lines: [],
    ...overrides,
  };
}

/**
 * Build a Home growth brief for Kellie's most recently published TikTok.
 * View and follower deltas share one compatible comparison interval.
 */
export function buildLatestVideoGrowth(input: {
  current: GrowthAccountSnapshot | null;
  previous: GrowthAccountSnapshot | null;
  authoritativeFollowers?: number | null;
}): LatestVideoGrowth {
  const current = input.current;
  if (!current) return emptyLatestVideoGrowth();

  const latest = selectLatestPublishedVideo(current.recentVideos);
  const followers =
    input.authoritativeFollowers != null ? input.authoritativeFollowers : current.followers;

  const named = latest
    ? {
        videoId: latest.videoId,
        videoTitle: latest.title,
        publishedAt: latest.publishedAt,
        currentViews: latest.views,
      }
    : {
        videoId: null,
        videoTitle: null,
        publishedAt: null,
        currentViews: null,
      };

  const compat = areSnapshotsCompatible(current, input.previous);
  if (!compat.ok || !input.previous) {
    return emptyLatestVideoGrowth({
      ...named,
      followers,
      compatible: false,
      incompatibilityReason: compat.reason ?? 'missing_snapshot',
    headline: named.videoTitle ? `“${displayVideoTitle(named.videoTitle)}”` : null,
    });
  }

  const previous = input.previous;
  const interval: ComparisonInterval = { from: previous.capturedAt, to: current.capturedAt };
  const followerDelta =
    previous.followers != null && current.followers != null
      ? current.followers - previous.followers
      : null;

  let viewDelta: number | null = null;
  let previousViews: number | null = null;
  let firstTracked = false;
  if (latest) {
    const prior = previous.recentVideos.find((v) => v.videoId === latest.videoId) ?? null;
    if (!prior) {
      firstTracked = true;
      previousViews = null;
      viewDelta = latest.views > 0 ? latest.views : null;
    } else {
      previousViews = prior.views;
      const delta = latest.views - prior.views;
      viewDelta = delta > 0 ? delta : null;
    }
  }

  const lines: string[] = [];
  let headline: string | null = named.videoTitle ? `“${displayVideoTitle(named.videoTitle)}”` : null;
  if (latest && viewDelta != null && viewDelta > 0) {
    headline = formatVideoGrowthLine({
      title: latest.title,
      viewDelta,
      firstTracked,
    });
    if (!firstTracked && latest.views > viewDelta) {
      lines.push(`Now at ${formatGain(latest.views)} views.`);
    }
  }

  if (followerDelta != null && followerDelta > 0 && followers != null) {
    lines.push(formatFollowerGrowthLine(followerDelta, followers));
  }

  return {
    videoId: named.videoId,
    videoTitle: named.videoTitle,
    publishedAt: named.publishedAt,
    currentViews: named.currentViews,
    previousViews,
    viewDelta,
    firstTracked,
    followers,
    followerDelta,
    comparisonInterval: interval,
    compatible: true,
    incompatibilityReason: null,
    headline,
    lines,
  };
}

export function buildLatestVideoGrowthFromSnapshots(
  newestFirst: unknown[],
  authoritativeFollowers?: number | null,
): LatestVideoGrowth {
  const parsed = newestFirst.map(asGrowthAccountSnapshot);
  const pair = pickCompatibleSnapshotPair(parsed);
  return buildLatestVideoGrowth({
    current: pair.current,
    previous: pair.previous,
    authoritativeFollowers,
  });
}
