// Publisher — cron-style. Polls `publications` rows due now, calls platform
// provider, transitions content_item to `published` once all publications succeed.

import { and, eq, sql, count } from 'drizzle-orm';
import {
  db,
  contentItems,
  publications,
  publishingTargets,
  providers,
} from '@social-agent/core';
import { createCronWorker } from '../runtime.js';

const igProvider = providers.createInstagramProvider();
const ttProvider = providers.createTikTokProvider();

function providerFor(platform: string) {
  if (platform === 'instagram') return igProvider;
  if (platform === 'tiktok') return ttProvider;
  throw new Error(`no provider for platform=${platform}`);
}

const MAX_RETRY = 5;

export const publisherWorker = createCronWorker({
  name: 'publisher',
  intervalMs: 5_000,
  run: async () => {
    // Pick due publications. Lock with FOR UPDATE SKIP LOCKED.
    const claimed = await db.execute(sql`
      WITH claimed AS (
        SELECT p.id
        FROM publications p
        WHERE p.status = 'queued'
          AND (p.scheduled_for IS NULL OR p.scheduled_for <= now())
        ORDER BY p.scheduled_for NULLS FIRST
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      UPDATE publications SET status = 'publishing', updated_at = now()
      FROM claimed
      WHERE publications.id = claimed.id
      RETURNING publications.*
    `);
    const rows = claimed as unknown as Array<{
      id: string;
      content_item_id: string;
      target_id: string;
      caption: string | null;
      hashtags: string[] | null;
      retry_count: number;
    }>;

    for (const row of rows) {
      try {
        // Resolve content_item + target
        const [item, target] = await Promise.all([
          db.query.contentItems.findFirst({ where: eq(contentItems.id, row.content_item_id) }),
          db.query.publishingTargets.findFirst({ where: eq(publishingTargets.id, row.target_id) }),
        ]);
        if (!item || !target) throw new Error('missing item or target');
        if (!item.finalVideoUrl) throw new Error('item missing final_video_url');

        const provider = providerFor(target.platform);
        const result = await provider.publish({
          videoUrl: item.finalVideoUrl,
          caption: row.caption ?? '',
          hashtags: row.hashtags ?? [],
        });

        await db
          .update(publications)
          .set({
            status: 'published',
            postedAt: new Date(),
            remotePostId: result.remotePostId,
            remotePostUrl: result.remotePostUrl,
          })
          .where(eq(publications.id, row.id));

        // If all publications for this content item are published → mark item published
        const pendingRows = await db
          .select({ pending: count() })
          .from(publications)
          .where(
            and(
              eq(publications.contentItemId, row.content_item_id),
              sql`${publications.status} <> 'published'`
            )
          );
        const pending = pendingRows[0]?.pending ?? 0;

        if (pending === 0) {
          await db
            .update(contentItems)
            .set({ state: 'published', publishedAt: new Date() })
            .where(eq(contentItems.id, row.content_item_id));
          console.log(`[publisher] content_item ${row.content_item_id} → published`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retryCount = (row.retry_count ?? 0) + 1;
        const status = retryCount >= MAX_RETRY ? 'failed' : 'queued';

        await db
          .update(publications)
          .set({
            status,
            retryCount,
            error: message,
            scheduledFor: status === 'queued'
              ? new Date(Date.now() + 60_000 * 2 ** retryCount)
              : undefined,
          })
          .where(eq(publications.id, row.id));

        if (status === 'failed') {
          // Mark the content item failed if any target permanently failed.
          await db
            .update(contentItems)
            .set({ state: 'failed', lastError: `publish failed on platform: ${message}` })
            .where(
              and(
                eq(contentItems.id, row.content_item_id),
                sql`${contentItems.state} <> 'published'`
              )
            );
        }
        console.warn(`[publisher] publication ${row.id} failed: ${message}`);
      }
    }
  },
});
