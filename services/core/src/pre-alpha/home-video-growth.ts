/**
 * Per-video Home growth briefing — latest posting batch vs two compatible snapshots.
 * Recovers pulse's newest-first recentVideos (cap 15) and former GPT mostRecentVideos (cap 5).
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

export type VideoGrowthRow = {
  videoId: string;
  title: string;
  publishedAt: string;
  currentViews: number;
  previousViews: number | null;
  viewDelta: number | null;
  firstTracked: boolean;
  line: string;
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
  videos: VideoGrowthRow[];
  overflowLines: string[];
  followerLine: string | null;
  empty: boolean;
};

/** Consecutive publish gap that still counts as one posting session. */
export const POSTING_BATCH_MAX_GAP_MS = 6 * 60 * 60 * 1000;
/** Home card shows this many videos before “View all.” */
export const HOME_VIDEO_VISIBLE_LIMIT = 3;
/** Former pulse GPT `mostRecentVideos` pool — overflow cap. */
export const FORMER_RECENT_VIDEO_LIMIT = 5;

export const LATEST_POSTS_HEADLINE = 'Your latest posts';
export const NO_VIDEO_GROWTH_EMPTY =
  'No new view movement on your latest posts since the last check.';

const CATALOG_VIEW_DROP_ABS = 1_000;
const CATALOG_VIEW_DROP_RATIO = 0.05;
const MIN_OVERLAP_DENOM = 3;
const MIN_OVERLAP_RATIO = 0.4;

export function isAccountWideTotalViewsLine(line: string): boolean {
  return /total views?\b/i.test(line);
}

export function isFollowerGrowthLine(line: string): boolean {
  return /^You gained \d/.test(line);
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

export function sortVideosNewestFirst(videos: GrowthVideoSnapshot[]): GrowthVideoSnapshot[] {
  return [...videos].sort((a, b) => {
    const aMs = parseIsoMs(a.publishedAt) ?? 0;
    const bMs = parseIsoMs(b.publishedAt) ?? 0;
    if (bMs !== aMs) return bMs - aMs;
    return b.videoId.localeCompare(a.videoId);
  });
}

/** Latest published video by publication timestamp, not by view gain. */
export function selectLatestPublishedVideo(
  videos: GrowthVideoSnapshot[],
): GrowthVideoSnapshot | null {
  return sortVideosNewestFirst(videos)[0] ?? null;
}

/**
 * Videos published together in the newest session (newest first).
 * Consecutive gap must stay within POSTING_BATCH_MAX_GAP_MS; capped at former GPT pool of 5.
 */
export function selectLatestPostingBatch(videos: GrowthVideoSnapshot[]): GrowthVideoSnapshot[] {
  const sorted = sortVideosNewestFirst(videos);
  const newest = sorted[0];
  if (!newest) return [];
  const batch: GrowthVideoSnapshot[] = [newest];
  for (let i = 1; i < sorted.length && batch.length < FORMER_RECENT_VIDEO_LIMIT; i++) {
    const candidate = sorted[i]!;
    const prev = batch[batch.length - 1]!;
    const prevMs = parseIsoMs(prev.publishedAt);
    const candMs = parseIsoMs(candidate.publishedAt);
    if (prevMs == null || candMs == null) break;
    if (prevMs - candMs > POSTING_BATCH_MAX_GAP_MS) break;
    batch.push(candidate);
  }
  return batch;
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

function formatViewUnit(n: number): string {
  return n === 1 ? 'view' : 'views';
}

export function formatVideoGrowthLine(input: {
  title: string;
  viewDelta?: number | null;
  currentViews: number;
  firstTracked: boolean;
}): string {
  const title = displayVideoTitle(input.title);
  if (input.firstTracked) {
    return `“${title}” — Since first tracked: ${formatGain(input.currentViews)} ${formatViewUnit(input.currentViews)}.`;
  }
  const delta = input.viewDelta ?? 0;
  return `“${title}” gained ${formatGain(delta)} ${formatViewUnit(delta)} since the last check, now at ${formatGain(input.currentViews)}.`;
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
    videos: [],
    overflowLines: [],
    followerLine: null,
    empty: true,
    ...overrides,
  };
}

function rowForVideo(
  video: GrowthVideoSnapshot,
  previousById: Map<string, GrowthVideoSnapshot>,
): VideoGrowthRow | null {
  const prior = previousById.get(video.videoId) ?? null;
  if (!prior) {
    if (video.views <= 0) return null;
    return {
      videoId: video.videoId,
      title: video.title,
      publishedAt: video.publishedAt,
      currentViews: video.views,
      previousViews: null,
      viewDelta: video.views,
      firstTracked: true,
      line: formatVideoGrowthLine({
        title: video.title,
        currentViews: video.views,
        viewDelta: video.views,
        firstTracked: true,
      }),
    };
  }
  const delta = video.views - prior.views;
  if (delta <= 0) return null;
  return {
    videoId: video.videoId,
    title: video.title,
    publishedAt: video.publishedAt,
    currentViews: video.views,
    previousViews: prior.views,
    viewDelta: delta,
    firstTracked: false,
    line: formatVideoGrowthLine({
      title: video.title,
      currentViews: video.views,
      viewDelta: delta,
      firstTracked: false,
    }),
  };
}

/**
 * Build a Home growth brief for Kellie's latest posting batch.
 * Every video and the follower delta share one compatible comparison interval.
 */
export function buildLatestVideoGrowth(input: {
  current: GrowthAccountSnapshot | null;
  previous: GrowthAccountSnapshot | null;
  authoritativeFollowers?: number | null;
}): LatestVideoGrowth {
  const current = input.current;
  if (!current) return emptyLatestVideoGrowth();

  const followers =
    input.authoritativeFollowers != null ? input.authoritativeFollowers : current.followers;
  const latest = selectLatestPublishedVideo(current.recentVideos);
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
      headline: NO_VIDEO_GROWTH_EMPTY,
    });
  }

  const previous = input.previous;
  const interval: ComparisonInterval = { from: previous.capturedAt, to: current.capturedAt };
  const followerDelta =
    previous.followers != null && current.followers != null
      ? current.followers - previous.followers
      : null;
  const followerLine =
    followerDelta != null && followerDelta > 0 && followers != null
      ? formatFollowerGrowthLine(followerDelta, followers)
      : null;

  const previousById = new Map(previous.recentVideos.map((v) => [v.videoId, v]));
  const videos = selectLatestPostingBatch(current.recentVideos)
    .map((video) => rowForVideo(video, previousById))
    .filter((row): row is VideoGrowthRow => row != null);

  const videoLines = videos.map((v) => v.line);
  const visibleLines = videoLines.slice(0, HOME_VIDEO_VISIBLE_LIMIT);
  const overflowLines = videoLines.slice(HOME_VIDEO_VISIBLE_LIMIT);
  const empty = videos.length === 0;
  const lead = videos[0];

  let headline: string | null = null;
  if (empty) {
    headline = NO_VIDEO_GROWTH_EMPTY;
  } else if (videos.length === 1) {
    headline = lead!.line;
  } else {
    headline = LATEST_POSTS_HEADLINE;
  }

  const lines = [
    ...(videos.length === 1 ? [] : visibleLines),
    ...(followerLine ? [followerLine] : []),
  ];

  return {
    videoId: lead?.videoId ?? named.videoId,
    videoTitle: lead?.title ?? named.videoTitle,
    publishedAt: lead?.publishedAt ?? named.publishedAt,
    currentViews: lead?.currentViews ?? named.currentViews,
    previousViews: lead?.previousViews ?? null,
    viewDelta: lead?.viewDelta ?? null,
    firstTracked: lead?.firstTracked ?? false,
    followers,
    followerDelta,
    comparisonInterval: interval,
    compatible: true,
    incompatibilityReason: null,
    headline,
    lines,
    videos,
    overflowLines,
    followerLine,
    empty,
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
