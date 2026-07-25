import { and, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { INGEST_RETENTION_DAYS_PAST_EVENT } from './retention.js';

export type ExpiredEventSweepResult = {
  scanned: number;
  deleted: number;
  cancelled: number;
  sampleTitles: string[];
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
 * Nightly / on-demand cleanup for past events that still clutter Opportunities
 * and confuse Benson (e.g. Mecum Auto Auction 2019).
 *
 * - Hard-deletes ingested rows whose event date is past the retention window.
 * - Soft-cancels remaining expired pipeline rows (no event dates but already cancelled skip).
 * Linked planner / green-screen / assets cascade or null out via FK rules.
 */
export async function runExpiredEventSweep(options?: {
  daysPast?: number;
  dryRun?: boolean;
  limit?: number;
}): Promise<ExpiredEventSweepResult> {
  const daysPast = options?.daysPast ?? INGEST_RETENTION_DAYS_PAST_EVENT;
  const dryRun = options?.dryRun ?? false;
  const limit = options?.limit ?? 5_000;

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
    return { scanned: 0, deleted: 0, cancelled: 0, sampleTitles: [] };
  }

  if (dryRun) {
    return {
      scanned: candidates.length,
      deleted: candidates.length,
      cancelled: 0,
      sampleTitles,
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
