import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorAccounts,
  creatorMetricsSnapshots,
  creatorVideos,
  type Platform,
} from '../schema.js';
import { computeEngagementRate, parsePublishedAt } from './parse.js';
import type { ImportResult, ImportVideoRow, MetricsSource } from './types.js';

const DEFAULT_TIKTOK_USERNAME = 'kelliekc';

export async function getOrCreateAccount(
  platform: Platform,
  username: string,
  displayName?: string | null,
): Promise<string> {
  const existing = await db
    .select({ id: creatorAccounts.id })
    .from(creatorAccounts)
    .where(and(eq(creatorAccounts.platform, platform), eq(creatorAccounts.username, username)))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(creatorAccounts)
    .values({
      platform,
      username,
      displayName: displayName ?? username,
      profileUrl: platform === 'tiktok' ? `https://www.tiktok.com/@${username}` : null,
      connectionStatus: 'import_only',
    })
    .returning({ id: creatorAccounts.id });

  return created!.id;
}

async function upsertVideoWithMetrics(
  accountId: string,
  platform: Platform,
  row: ImportVideoRow,
  source: MetricsSource,
): Promise<'imported' | 'updated' | 'skipped'> {
  const publishedAt = parsePublishedAt(row.published_at);
  if (!publishedAt) {
    throw new Error(`Invalid published_at: ${row.published_at}`);
  }

  const existing = await db
    .select({ id: creatorVideos.id })
    .from(creatorVideos)
    .where(and(eq(creatorVideos.accountId, accountId), eq(creatorVideos.videoId, row.video_id)))
    .limit(1);

  const views = row.views ?? 0;
  const likes = row.likes ?? 0;
  const comments = row.comments ?? 0;
  const shares = row.shares ?? 0;
  const engagementRate = computeEngagementRate(
    views,
    likes,
    comments,
    shares,
    row.saves,
    row.engagement_rate,
  );

  let videoDbId: string;

  if (existing[0]) {
    videoDbId = existing[0].id;
    await db
      .update(creatorVideos)
      .set({
        title: row.title ?? undefined,
        caption: row.caption ?? undefined,
        postUrl: row.post_url ?? undefined,
        thumbnailUrl: row.thumbnail_url ?? undefined,
        publishedAt,
        contentCategory: row.content_category ?? undefined,
        contentPillar: row.content_pillar ?? undefined,
        locationTag: row.location_tag ?? undefined,
        sponsorTag: row.sponsor_tag ?? undefined,
        opportunityId: row.opportunity_id ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(creatorVideos.id, videoDbId));

    if (!row.preserve_metrics) {
      await db.insert(creatorMetricsSnapshots).values({
        videoId: videoDbId,
        views,
        likes,
        comments,
        shares,
        saves: row.saves,
        engagementRate: String(engagementRate),
        watchTimeSeconds: row.watch_time_seconds,
        averageWatchDurationSeconds:
          row.average_watch_duration_seconds != null
            ? String(row.average_watch_duration_seconds)
            : null,
        completionRate: row.completion_rate != null ? String(row.completion_rate) : null,
        followerCountSnapshot: row.follower_count_snapshot,
        source,
        raw: row,
      });
    }

    return 'updated';
  }

  const [created] = await db
    .insert(creatorVideos)
    .values({
      accountId,
      platform,
      videoId: row.video_id,
      title: row.title,
      caption: row.caption,
      postUrl: row.post_url,
      thumbnailUrl: row.thumbnail_url,
      publishedAt,
      contentCategory: row.content_category,
      contentPillar: row.content_pillar,
      locationTag: row.location_tag,
      sponsorTag: row.sponsor_tag,
      opportunityId: row.opportunity_id,
    })
    .returning({ id: creatorVideos.id });

  videoDbId = created!.id;

  await db.insert(creatorMetricsSnapshots).values({
    videoId: videoDbId,
    views,
    likes,
    comments,
    shares,
    saves: row.saves,
    engagementRate: String(engagementRate),
    watchTimeSeconds: row.watch_time_seconds,
    averageWatchDurationSeconds:
      row.average_watch_duration_seconds != null
        ? String(row.average_watch_duration_seconds)
        : null,
    completionRate: row.completion_rate != null ? String(row.completion_rate) : null,
    followerCountSnapshot: row.follower_count_snapshot,
    source,
    raw: row,
  });

  return 'imported';
}

export async function importVideoRows(
  rows: ImportVideoRow[],
  options: {
    platform?: Platform;
    username?: string;
    source?: MetricsSource;
  } = {},
): Promise<ImportResult> {
  const platform = options.platform ?? 'tiktok';
  const username = options.username ?? DEFAULT_TIKTOK_USERNAME;
  const source = options.source ?? 'import';

  const accountId = await getOrCreateAccount(platform, username);

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    try {
      const status = await upsertVideoWithMetrics(accountId, platform, rows[i]!, source);
      result[status]++;
    } catch (err) {
      result.skipped++;
      result.errors.push({
        row: i + 1,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return result;
}

export async function countVideosForPlatform(platform: Platform): Promise<number> {
  const rows = await db
    .select({ id: creatorVideos.id })
    .from(creatorVideos)
    .where(eq(creatorVideos.platform, platform));
  return rows.length;
}

export async function getLatestSnapshotMap(
  videoIds: string[],
): Promise<Map<string, typeof creatorMetricsSnapshots.$inferSelect>> {
  const map = new Map<string, typeof creatorMetricsSnapshots.$inferSelect>();
  if (videoIds.length === 0) return map;

  for (const videoId of videoIds) {
    const [snap] = await db
      .select()
      .from(creatorMetricsSnapshots)
      .where(eq(creatorMetricsSnapshots.videoId, videoId))
      .orderBy(desc(creatorMetricsSnapshots.collectedAt))
      .limit(1);
    if (snap) map.set(videoId, snap);
  }

  return map;
}
