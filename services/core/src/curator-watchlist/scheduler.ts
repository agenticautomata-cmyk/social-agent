/**
 * Bounded Instagram/curator watchlist scheduler.
 * Runs via the curator-watchlist-check worker — never a historical profile crawl.
 */
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { recordSourceRun } from '../benson-scout/watchlist.js';
import {
  markInstagramAuthenticationRequired,
  reconcileAuthenticatedInstagramSuccess,
} from './auth-reconciliation.js';
import { syncInstagramWatchersWithSharedSession } from './instagram-session.js';
import { runCuratorWatchlistPipeline } from './pipeline.js';

export const CURATOR_WATCHLIST_WORKER_ID = 'curator-watchlist-check';

/** Default cycle interval for the worker (4h). */
export const CURATOR_WATCHLIST_INTERVAL_MS = 4 * 60 * 60 * 1000;

const MAX_SOURCES_PER_CYCLE = 3;
const MAX_AUTH_BACKOFF_MS = 24 * 60 * 60 * 1000;

/** Repo-root log dir — workers/API may start with cwd under services/*. */
function preAlphaLogDir(): string {
  const root = process.env.BENSON_REPO_ROOT?.trim() || process.cwd();
  return join(root, '.logs', 'pre-alpha');
}

const GLOBAL_LOCK_NAME = 'curator-watchlist-check.lock';

export type ScheduledWatcherCheckResult = {
  watcherId: string;
  sourceName: string | null;
  canonicalKey: string | null;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  postsProcessed?: number;
  newPosts?: number;
  eventsExtracted?: number;
  eventsVerified?: number;
  durationMs: number;
  inspectionSummary?: string;
};

export type CuratorWatchlistCycleResult = {
  startedAt: string;
  finishedAt: string;
  skipped: boolean;
  skipReason?: string;
  sourcesChecked: number;
  results: ScheduledWatcherCheckResult[];
};

async function ensureLockDir(): Promise<string> {
  const dir = preAlphaLogDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

function globalLockPath(): string {
  return join(preAlphaLogDir(), GLOBAL_LOCK_NAME);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exclusive lock shared by scheduled cycles and manual Check now.
 * Stale locks from dead PIDs are reclaimed.
 */
export async function acquireCuratorWatchlistLock(
  lockPath?: string,
): Promise<(() => Promise<void>) | null> {
  await ensureLockDir();
  const path = lockPath ?? globalLockPath();

  const tryCreate = async (): Promise<boolean> => {
    try {
      const handle = await open(path, 'wx');
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      await handle.close();
      return true;
    } catch {
      return false;
    }
  };

  if (await tryCreate()) {
    return async () => {
      await unlink(path).catch(() => undefined);
    };
  }

  // Reclaim stale lock if holder is dead.
  try {
    const raw = await readFile(path, 'utf8');
    const pid = parseInt(raw.split('\n')[0] ?? '', 10);
    if (Number.isFinite(pid) && !pidAlive(pid)) {
      await unlink(path).catch(() => undefined);
      if (await tryCreate()) {
        return async () => {
          await unlink(path).catch(() => undefined);
        };
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

/** Small randomized delay (0–10 min) so cycles don't stampede. */
export function curatorWatchlistJitterMs(): number {
  return Math.floor(Math.random() * 10 * 60_000);
}

function isDue(watcher: {
  lastSuccessfulCheck: Date | null;
  lastAttemptedCheck: Date | null;
  checkFrequencyMs: number;
  lastFailureAt: Date | null;
  authenticationRequired: boolean;
}): boolean {
  const now = Date.now();
  if (watcher.authenticationRequired) {
    const lastFail = watcher.lastFailureAt?.getTime() ?? 0;
    const backoff = Math.min(MAX_AUTH_BACKOFF_MS, CURATOR_WATCHLIST_INTERVAL_MS);
    if (lastFail && now - lastFail < backoff) return false;
  }

  const anchor =
    watcher.lastSuccessfulCheck?.getTime() ??
    watcher.lastAttemptedCheck?.getTime() ??
    0;
  if (!anchor) return true;
  return now >= anchor + watcher.checkFrequencyMs;
}

/** Due Instagram curator sources — paused/disabled excluded, ordered oldest-first. */
export async function listDueCuratorWatchers(limit = MAX_SOURCES_PER_CYCLE) {
  await syncInstagramWatchersWithSharedSession();
  const rows = await db
    .select()
    .from(sourceWatchers)
    .where(
      and(
        eq(sourceWatchers.enabled, true),
        eq(sourceWatchers.paused, false),
        eq(sourceWatchers.platform, 'instagram'),
        or(
          eq(sourceWatchers.watcherKind, 'curator'),
          eq(sourceWatchers.adapterType, 'social_account'),
          sql`(${sourceWatchers.extractionConfig}->>'curatorPipeline')::boolean = true`,
        ),
      ),
    )
    .orderBy(asc(sourceWatchers.lastSuccessfulCheck), asc(sourceWatchers.createdAt));

  return rows.filter(isDue).slice(0, limit);
}

export async function runScheduledCuratorWatcher(
  watcherId: string,
  triggerType: 'scheduled' | 'manual' = 'scheduled',
): Promise<ScheduledWatcherCheckResult> {
  const started = Date.now();
  const [watcher] = await db
    .select()
    .from(sourceWatchers)
    .where(eq(sourceWatchers.id, watcherId))
    .limit(1);

  if (!watcher) {
    return {
      watcherId,
      sourceName: null,
      canonicalKey: null,
      ok: false,
      reason: 'Source not found',
      durationMs: Date.now() - started,
    };
  }

  if (watcher.paused || !watcher.enabled) {
    return {
      watcherId,
      sourceName: watcher.sourceName,
      canonicalKey: watcher.canonicalKey,
      ok: false,
      skipped: true,
      reason: 'Source is paused or disabled',
      durationMs: Date.now() - started,
    };
  }

  await db
    .update(sourceWatchers)
    .set({ lastAttemptedCheck: new Date(), updatedAt: new Date() })
    .where(eq(sourceWatchers.id, watcherId));

  const result = await runCuratorWatchlistPipeline({ watcherId });
  const inspectionSummary = result.inspectionSummary;
  await recordSourceRun({
    watcherId,
    triggerType,
    finalFetchMethod: 'curator_instagram_pipeline',
    itemCount: result.postsDiscovered ?? result.eventsExtracted,
    newCount: result.newlyInspected ?? result.newPosts,
    qualifiedCount: result.eventsExtracted,
    hiddenCount: (result.alreadyKnown ?? 0) + (result.captureFailed ?? 0),
    sanitizedFailure: result.ok ? undefined : result.error,
    traceId: createHash('sha256')
      .update(`${watcherId}:${triggerType}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16),
    metadata: inspectionSummary
      ? {
          inspectionSummary,
          postsDiscovered: result.postsDiscovered ?? 0,
          alreadyKnown: result.alreadyKnown ?? 0,
          newlyInspected: result.newlyInspected ?? 0,
          captureFailed: result.captureFailed ?? 0,
          eventsExtracted: result.eventsExtracted,
        }
      : undefined,
  });

  if (result.pausedForAuth) {
    await markInstagramAuthenticationRequired(watcherId, result.error ?? 'Login required');
  } else if (result.ok) {
    await reconcileAuthenticatedInstagramSuccess(watcherId);
  }

  return {
    watcherId,
    sourceName: watcher.sourceName,
    canonicalKey: watcher.canonicalKey,
    ok: result.ok && !result.pausedForAuth,
    reason: result.error ?? (result.ok ? undefined : result.inspectionSummary ?? 'Pipeline returned not-ok'),
    postsProcessed: result.postsProcessed,
    newPosts: result.newPosts,
    eventsExtracted: result.eventsExtracted,
    eventsVerified: result.eventsVerified,
    inspectionSummary: result.inspectionSummary,
    durationMs: Date.now() - started,
  };
}

/**
 * One bounded scheduler cycle. Acquires the global lock so Check now cannot overlap.
 */
export async function runCuratorWatchlistCycle(): Promise<CuratorWatchlistCycleResult> {
  const startedAt = new Date();
  const release = await acquireCuratorWatchlistLock();
  if (!release) {
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      skipped: true,
      skipReason: 'Previous watchlist check still active',
      sourcesChecked: 0,
      results: [],
    };
  }

  try {
    const due = await listDueCuratorWatchers(MAX_SOURCES_PER_CYCLE);
    const results: ScheduledWatcherCheckResult[] = [];
    for (const watcher of due) {
      const one = await runScheduledCuratorWatcher(watcher.id, 'scheduled');
      results.push(one);
      console.log(
        `[curator-watchlist-check] ${watcher.sourceName ?? watcher.id}: ok=${one.ok}` +
          ` new=${one.newPosts ?? 0} events=${one.eventsExtracted ?? 0}` +
          (one.reason ? ` reason=${one.reason}` : ''),
      );
    }

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      skipped: false,
      sourcesChecked: results.length,
      results,
    };
  } finally {
    await release();
  }
}

/** Marker file written by the worker on start so UI can tell the scheduler is live. */
export function schedulerLiveMarkerPath(): string {
  return join(preAlphaLogDir(), 'curator-watchlist-scheduler.live');
}

export async function markSchedulerLive(): Promise<void> {
  await ensureLockDir();
  await writeFile(schedulerLiveMarkerPath(), `${process.pid}\n${new Date().toISOString()}\n`, 'utf8');
}

export async function isSchedulerLive(): Promise<boolean> {
  try {
    const raw = await readFile(schedulerLiveMarkerPath(), 'utf8');
    const pid = parseInt(raw.split('\n')[0] ?? '', 10);
    return Number.isFinite(pid) && pidAlive(pid);
  } catch {
    return false;
  }
}
