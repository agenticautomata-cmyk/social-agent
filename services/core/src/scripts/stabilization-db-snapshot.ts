import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers, workerHeartbeats, workerJobRuns } from '../schema.js';
import { isSchedulerLive } from '../curator-watchlist/scheduler.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';

const earlyHb = await db
  .select()
  .from(workerHeartbeats)
  .where(eq(workerHeartbeats.workerId, 'early-signals'));

const earlyRuns = await db
  .select({
    id: workerJobRuns.id,
    status: workerJobRuns.status,
    startedAt: workerJobRuns.startedAt,
    finishedAt: workerJobRuns.finishedAt,
    errorSummary: workerJobRuns.errorSummary,
    durationMs: workerJobRuns.durationMs,
  })
  .from(workerJobRuns)
  .where(eq(workerJobRuns.workerId, 'early-signals'))
  .orderBy(desc(workerJobRuns.startedAt))
  .limit(8);

const curatorHb = await db
  .select()
  .from(workerHeartbeats)
  .where(eq(workerHeartbeats.workerId, 'curator-watchlist-check'));

const jas = await db
  .select({
    id: sourceWatchers.id,
    sourceName: sourceWatchers.sourceName,
    canonicalKey: sourceWatchers.canonicalKey,
    sourceUrl: sourceWatchers.sourceUrl,
    enabled: sourceWatchers.enabled,
    paused: sourceWatchers.paused,
    lastSuccessfulCheck: sourceWatchers.lastSuccessfulCheck,
    lastAttemptedCheck: sourceWatchers.lastAttemptedCheck,
    checkFrequencyMs: sourceWatchers.checkFrequencyMs,
  })
  .from(sourceWatchers)
  .where(
    or(
      ilike(sourceWatchers.canonicalKey, '%jasfood%'),
      ilike(sourceWatchers.sourceName, '%jasfood%'),
      ilike(sourceWatchers.sourceUrl, '%jasfood%'),
    ),
  );

const gmail = await getGmailConnectionStatus().catch((e) => ({ error: String(e) }));
const schedulerLive = await isSchedulerLive();

const fkErrors = await db.execute(sql`
  select count(*)::int as n
  from worker_job_runs
  where worker_id = 'early-signals'
    and coalesce(error_summary, '') ilike '%worker_job_runs_worker_id_fkey%'
    and started_at > now() - interval '2 hours'
`);

console.log(
  JSON.stringify(
    {
      schedulerLive,
      earlySignalsHeartbeats: earlyHb.length,
      earlySignalsRecentRuns: earlyRuns,
      curatorWatchlistHeartbeats: curatorHb.length,
      jasfoodjourneySources: jas,
      gmail,
      recentFkErrors: (fkErrors as { rows?: Array<{ n: number }> }).rows?.[0]?.n ?? fkErrors,
    },
    null,
    2,
  ),
);
process.exit(0);
