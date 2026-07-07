import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sourceIngestionRuns } from '../schema.js';

export type LastLiveRefreshSummary = {
  lastRefreshAt: string | null;
  itemsDiscovered: number;
  itemsCreated: number;
  itemsUpdated: number;
  healthySources: number;
  failedSources: number;
  partialSources: number;
  totalSourcesRun: number;
};

/** Stats from the most recent live (non–dry-run) refresh batch. */
export async function getLastLiveRefreshSummary(): Promise<LastLiveRefreshSummary> {
  const [anchor] = await db
    .select({ startedAt: sourceIngestionRuns.startedAt })
    .from(sourceIngestionRuns)
    .where(eq(sourceIngestionRuns.dryRun, false))
    .orderBy(desc(sourceIngestionRuns.startedAt))
    .limit(1);

  if (!anchor?.startedAt) {
    return {
      lastRefreshAt: null,
      itemsDiscovered: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      healthySources: 0,
      failedSources: 0,
      partialSources: 0,
      totalSourcesRun: 0,
    };
  }

  const batchStart = new Date(anchor.startedAt.getTime() - 30 * 60 * 1000);

  const runs = await db
    .select()
    .from(sourceIngestionRuns)
    .where(
      and(
        eq(sourceIngestionRuns.dryRun, false),
        gte(sourceIngestionRuns.startedAt, batchStart),
      ),
    );

  let itemsCreated = 0;
  let itemsUpdated = 0;
  let healthy = 0;
  let failed = 0;
  let partial = 0;
  let lastFinished: Date | null = null;

  for (const run of runs) {
    itemsCreated += run.createdCount;
    itemsUpdated += run.updatedCount;
    if (run.status === 'success') healthy += 1;
    else if (run.status === 'failed') failed += 1;
    else if (run.status === 'partial') partial += 1;
    if (run.finishedAt && (!lastFinished || run.finishedAt > lastFinished)) {
      lastFinished = run.finishedAt;
    }
  }

  const itemsDiscovered = itemsCreated + itemsUpdated;

  return {
    lastRefreshAt: lastFinished?.toISOString() ?? anchor.startedAt.toISOString(),
    itemsDiscovered,
    itemsCreated,
    itemsUpdated,
    healthySources: healthy,
    failedSources: failed,
    partialSources: partial,
    totalSourcesRun: runs.length,
  };
}

export async function countNewItemsSince(iso: string | null): Promise<number> {
  if (!iso) return 0;
  const since = new Date(iso);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.sourceId} IS NOT NULL`,
        gte(contentItems.firstSeenAt, since),
      ),
    );
  return row?.count ?? 0;
}
