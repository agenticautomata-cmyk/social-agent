import { and, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { INGEST_RETENTION_DAYS_PAST_EVENT } from './retention.js';
import {
  runLifecycleRecompute,
  type LifecycleRecomputeResult,
} from './lifecycle-recompute.js';

export type ExpiredEventSweepResult = {
  scanned: number;
  deleted: number;
  cancelled: number;
  sampleTitles: string[];
  /** Batch 3: lifecycle recompute (non-destructive) runs before retention delete. */
  lifecycleRecompute: LifecycleRecomputeResult;
};

const DELETE_BATCH_SIZE = 200;

/** Event end (or start) is older than the inventory retention window. */
export function expiredEventSql(daysPast = INGEST_RETENTION_DAYS_PAST_EVENT) {
  return and(
    isNotNull(sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt})`),
    lt(
      sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt})`,
      sql`NOW() - (${daysPast}::int * INTERVAL '1 day')`,
    ),
  );
}

/**
 * Nightly / on-demand cleanup for past events.
 *
 * Batch 3 order of operations:
 * 1. Recompute lifecycle_status from temporal authority (no delete; expired ≠ retention).
 * 2. Hard-delete only rows past the long retention window (evidence cleanup, not currentness).
 *
 * Retention delete is NOT currentness. Ended events become lifecycle expired immediately
 * via step 1; they may remain stored for days until step 2.
 */
export async function runExpiredEventSweep(options?: {
  daysPast?: number;
  dryRun?: boolean;
  limit?: number;
  skipLifecycleRecompute?: boolean;
  now?: Date;
}): Promise<ExpiredEventSweepResult> {
  const daysPast = options?.daysPast ?? INGEST_RETENTION_DAYS_PAST_EVENT;
  const dryRun = options?.dryRun ?? false;
  const limit = options?.limit ?? 5_000;
  const now = options?.now ?? new Date();

  const lifecycleRecompute = options?.skipLifecycleRecompute
    ? {
        scanned: 0,
        updated: 0,
        alreadyCorrect: 0,
        byStatus: {},
        sample: [],
      }
    : await runLifecycleRecompute({ dryRun, limit, now });

  const candidates = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      state: contentItems.state,
      eventStartsAt: contentItems.eventStartsAt,
      eventEndsAt: contentItems.eventEndsAt,
    })
    .from(contentItems)
    .where(expiredEventSql(daysPast))
    .orderBy(sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) asc`)
    .limit(limit);

  const sampleTitles = candidates.slice(0, 12).map((row) => row.topic);
  if (candidates.length === 0) {
    return {
      scanned: 0,
      deleted: 0,
      cancelled: 0,
      sampleTitles: [],
      lifecycleRecompute,
    };
  }

  if (dryRun) {
    return {
      scanned: candidates.length,
      deleted: candidates.length,
      cancelled: 0,
      sampleTitles,
      lifecycleRecompute,
    };
  }

  let deleted = 0;
  const ids = candidates.map((row) => row.id);
  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    const batch = ids.slice(i, i + DELETE_BATCH_SIZE);
    const removed = await db
      .delete(contentItems)
      .where(inArray(contentItems.id, batch))
      .returning({ id: contentItems.id });
    deleted += removed.length;
  }

  return {
    scanned: candidates.length,
    deleted,
    cancelled: 0,
    sampleTitles,
    lifecycleRecompute,
  };
}

/** Count of expired dated opportunities still in the database. */
export async function countExpiredEvents(
  daysPast = INGEST_RETENTION_DAYS_PAST_EVENT,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(expiredEventSql(daysPast));
  return row?.count ?? 0;
}

export function isAncientEventDate(
  eventStartsAt: Date | null | undefined,
  eventEndsAt: Date | null | undefined,
  now = new Date(),
  daysPast = INGEST_RETENTION_DAYS_PAST_EVENT,
): boolean {
  const end = eventEndsAt ?? eventStartsAt;
  if (!end) return false;
  const cutoff = now.getTime() - daysPast * 24 * 60 * 60 * 1000;
  return end.getTime() < cutoff;
}
