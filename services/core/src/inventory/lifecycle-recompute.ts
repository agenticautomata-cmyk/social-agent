/**
 * Batch 3 — deterministic lifecycle recomputation for dated (and prose-stale) inventory.
 * Retention delete is separate: this only mutates lifecycle_status.
 */

import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { computeLifecycleStatus } from '../creator-agent/lifecycle.js';
import type { LifecycleStatus } from '../creator-agent/types.js';
import { hasStaleCurrentnessClaim } from '../creator-agent/stale-temporal-prose.js';

export type LifecycleRecomputeResult = {
  scanned: number;
  updated: number;
  alreadyCorrect: number;
  byStatus: Record<string, number>;
  sample: Array<{ id: string; topic: string; from: string; to: string }>;
};

const OPERATOR_CURRENT = new Set(['upcoming', 'active', 'expiring_soon', 'needs_date_verification']);

function metaTimezone(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.timezone === 'string' && m.timezone.trim()) return m.timezone.trim();
  if (typeof m.timeZone === 'string' && m.timeZone.trim()) return m.timeZone.trim();
  return null;
}

function appendTag(prev: unknown, tag: string): string[] {
  const base = Array.isArray(prev)
    ? prev.filter((x): x is string => typeof x === 'string')
    : [];
  return base.includes(tag) ? base : [...base, tag];
}

/**
 * Recompute lifecycle_status from event dates (+ stale next-event prose when undated).
 * Idempotent. Never deletes rows. No paid research.
 */
export async function runLifecycleRecompute(options?: {
  dryRun?: boolean;
  limit?: number;
  now?: Date;
  /** Only rows currently stamped operator-current (default true). */
  onlyCurrentStatuses?: boolean;
}): Promise<LifecycleRecomputeResult> {
  const dryRun = options?.dryRun ?? false;
  const limit = options?.limit ?? 10_000;
  const now = options?.now ?? new Date();
  const onlyCurrent = options?.onlyCurrentStatuses ?? true;

  const statusFilter = onlyCurrent
    ? inArray(contentItems.lifecycleStatus, [
        'upcoming',
        'active',
        'expiring_soon',
        'needs_date_verification',
      ])
    : sql`true`;

  const datedOrScripted = or(
    isNotNull(contentItems.eventStartsAt),
    isNotNull(contentItems.eventEndsAt),
    sql`coalesce(${contentItems.script}, '') ~* '(next event|upcoming event|scheduled for)'`,
  );

  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      script: contentItems.script,
      eventStartsAt: contentItems.eventStartsAt,
      eventEndsAt: contentItems.eventEndsAt,
      discoveredAt: contentItems.discoveredAt,
      lifecycleStatus: contentItems.lifecycleStatus,
      metadata: contentItems.metadata,
      creatorRelevanceExplanation: contentItems.creatorRelevanceExplanation,
    })
    .from(contentItems)
    .where(and(statusFilter, datedOrScripted, ne(contentItems.lifecycleStatus, 'archived')))
    .orderBy(sql`coalesce(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}, ${contentItems.discoveredAt}) asc nulls last`)
    .limit(limit);

  const byStatus: Record<string, number> = {};
  const sample: LifecycleRecomputeResult['sample'] = [];
  let updated = 0;
  let alreadyCorrect = 0;

  for (const row of rows) {
    const timezone = metaTimezone(row.metadata);
    let next = computeLifecycleStatus(
      {
        title: row.topic,
        eventStartsAt: row.eventStartsAt,
        eventEndsAt: row.eventEndsAt,
        discoveredAt: row.discoveredAt,
        metadata: {
          ...((row.metadata as Record<string, unknown>) ?? {}),
          ...(timezone ? { timezone } : {}),
        },
      },
      now,
    );

    // Undated rows with stale "next event … <past date>" prose → expired (evidence kept).
    if (
      OPERATOR_CURRENT.has(next) &&
      !row.eventStartsAt &&
      !row.eventEndsAt &&
      hasStaleCurrentnessClaim(row.script, { now, timezone })
    ) {
      next = 'expired';
    }

    byStatus[next] = (byStatus[next] ?? 0) + 1;

    if (next === row.lifecycleStatus) {
      alreadyCorrect += 1;
      continue;
    }

    if (sample.length < 20) {
      sample.push({
        id: row.id,
        topic: row.topic,
        from: row.lifecycleStatus,
        to: next,
      });
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    await db
      .update(contentItems)
      .set({
        lifecycleStatus: next as LifecycleStatus,
        creatorRelevanceExplanation: appendTag(
          row.creatorRelevanceExplanation,
          'reconcile:lifecycle_recompute_batch3',
        ),
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, row.id));
    updated += 1;
  }

  return {
    scanned: rows.length,
    updated,
    alreadyCorrect,
    byStatus,
    sample,
  };
}

/** Count operator-current rows whose dates (or stale prose) imply non-current. */
export async function countStaleLifecycleRows(now = new Date()): Promise<number> {
  const result = await runLifecycleRecompute({ dryRun: true, now, limit: 50_000 });
  return result.updated;
}
