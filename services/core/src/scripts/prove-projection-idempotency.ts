/**
 * Two-run projection idempotency proof with DB timestamp/hash evidence.
 */
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { ensureCalendarInventoryProjections } from '../creator-calendar/population/sync.js';

function rowHash(row: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 16);
}

async function snapshot() {
  const result = await db.execute(sql`
    SELECT id, title, location, start_at, updated_at, source_url,
           md5(COALESCE(metadata::text, '')) AS meta_md5,
           planning_status
    FROM creator_calendar_items
    WHERE start_at >= '2026-09-12'::timestamptz
      AND start_at < '2026-10-21'::timestamptz
      AND planning_status = 'suggested'
    ORDER BY id
  `);
  const rows = (result.rows ?? result) as Array<Record<string, unknown>>;
  const maxUpdated = rows.reduce((m, r) => {
    const t = new Date(String(r.updated_at)).getTime();
    return Number.isFinite(t) ? Math.max(m, t) : m;
  }, 0);
  return {
    count: rows.length,
    maxUpdatedAt: maxUpdated ? new Date(maxUpdated).toISOString() : null,
    aggregateHash: rowHash(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        location: r.location,
        start_at: r.start_at,
        updated_at: r.updated_at,
        source_url: r.source_url,
        meta_md5: r.meta_md5,
      })),
    ),
    sample: rows.slice(0, 3).map((r) => ({
      id: r.id,
      updated_at: r.updated_at,
      meta_md5: r.meta_md5,
    })),
  };
}

const from = new Date('2026-09-12T00:00:00.000Z');
const to = new Date('2026-10-20T23:59:59.000Z');

const before = await snapshot();
const run1 = await ensureCalendarInventoryProjections(from, to, new Date());
const after1 = await snapshot();
const run2 = await ensureCalendarInventoryProjections(from, to, new Date());
const after2 = await snapshot();

const report = {
  run1: {
    created: run1.created,
    updated: run1.updated,
    materiallyUpdated: run1.materiallyUpdated,
    unchanged: run1.unchanged,
    suppressed: run1.suppressed,
    merged: run1.merged,
    evaluated: run1.evaluated,
  },
  run2: {
    created: run2.created,
    updated: run2.updated,
    materiallyUpdated: run2.materiallyUpdated,
    unchanged: run2.unchanged,
    suppressed: run2.suppressed,
    merged: run2.merged,
    evaluated: run2.evaluated,
  },
  db: {
    before,
    after1,
    after2,
    secondRunMutated:
      after1.aggregateHash !== after2.aggregateHash ||
      after1.maxUpdatedAt !== after2.maxUpdatedAt,
  },
};

console.log(JSON.stringify(report, null, 2));
process.exit(0);
