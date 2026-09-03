/**
 * Closes out worker runs that were left `running` when a process died.
 *
 * 65 rows across 12 workers were stuck in `running`, the oldest since 2026-07-25.
 * A run that never finished is indistinguishable from one still in progress, so
 * "is this worker healthy?" had no answer — and a genuinely hung worker would have
 * looked exactly the same as these corpses.
 *
 * They are marked failed with an honest reason rather than deleted, so the history
 * still shows that the run happened and did not complete.
 */
import { sql } from 'drizzle-orm';

import { db } from '../db.js';

/**
 * A run still open after this long did not finish. The longest legitimate worker on
 * this host is the Playwright watchlist check, which is minutes rather than hours.
 */
const ABANDONED_AFTER_HOURS = 6;

const dryRun = process.argv.includes('--dry-run');

async function query<T>(text: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(text);
  return (Array.isArray(result)
    ? result
    : ((result as unknown as { rows: T[] }).rows ?? [])) as T[];
}

async function main(): Promise<void> {
  const stuck = await query<{ worker_id: string; runs: string; oldest: Date }>(sql`
    SELECT worker_id, count(*) AS runs, min(started_at) AS oldest
    FROM worker_job_runs
    WHERE status = 'running'
      AND started_at < now() - interval '${sql.raw(String(ABANDONED_AFTER_HOURS))} hours'
    GROUP BY worker_id
    ORDER BY 2 DESC
  `);

  if (stuck.length === 0) {
    console.log('No abandoned worker runs.');
    return;
  }

  const total = stuck.reduce((sum, row) => sum + Number(row.runs), 0);
  console.log(
    `${total} abandoned run(s) across ${stuck.length} worker(s)${dryRun ? ' [dry run]' : ''}:`,
  );
  for (const row of stuck) {
    console.log(
      `  ${row.worker_id}: ${row.runs} run(s), oldest ${new Date(row.oldest).toISOString().slice(0, 10)}`,
    );
  }

  if (dryRun) return;

  const updated = await query<{ id: string }>(sql`
    UPDATE worker_job_runs
    SET status = 'failed',
        finished_at = now(),
        error_summary = 'The run never reported a result. The worker process stopped before finishing, so this run was closed out by the sweeper.'
    WHERE status = 'running'
      AND started_at < now() - interval '${sql.raw(String(ABANDONED_AFTER_HOURS))} hours'
    RETURNING id
  `);

  console.log(`\nClosed ${updated.length} run(s) as failed.`);
}

void main();
