import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { runEarlySignalPipeline } from '../early-signals/pipeline.js';
import {
  acquireCuratorWatchlistLock,
  runScheduledCuratorWatcher,
} from '../curator-watchlist/scheduler.js';
import { recordSourceRun } from './watchlist.js';

export async function runWatcherNow(watcherId: string): Promise<{
  ok: boolean;
  newItems: number;
  qualified: number;
  error?: string;
}> {
  const [watcher] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, watcherId)).limit(1);
  if (!watcher) return { ok: false, newItems: 0, qualified: 0, error: 'Source not found' };

  if (watcher.paused || !watcher.enabled) {
    return { ok: false, newItems: 0, qualified: 0, error: 'Source is paused or disabled' };
  }

  const isCurator =
    watcher.watcherKind === 'curator' ||
    watcher.adapterType === 'social_account' ||
    (watcher.extractionConfig as { curatorPipeline?: boolean })?.curatorPipeline;

  if (isCurator && watcher.platform === 'instagram') {
    // Share the scheduler lock so Check now never overlaps a scheduled cycle.
    const release = await acquireCuratorWatchlistLock();
    if (!release) {
      return {
        ok: false,
        newItems: 0,
        qualified: 0,
        error: 'A watchlist check is already running — try again in a few minutes',
      };
    }
    try {
      const result = await runScheduledCuratorWatcher(watcherId, 'manual');
      return {
        ok: result.ok,
        newItems: result.eventsExtracted ?? 0,
        qualified: result.eventsVerified ?? 0,
        error: result.reason,
      };
    } finally {
      await release();
    }
  }

  if (watcher.sessionStatus === 'login_required' || watcher.authenticationRequired) {
    await recordSourceRun({
      watcherId,
      triggerType: 'manual',
      sanitizedFailure: 'Login required for this source',
      finalFetchMethod: 'blocked',
    });
    return { ok: false, newItems: 0, qualified: 0, error: 'Login required — source paused until you reauthorize' };
  }

  await db
    .update(sourceWatchers)
    .set({ lastAttemptedCheck: new Date(), updatedAt: new Date() })
    .where(eq(sourceWatchers.id, watcherId));

  try {
    const pipeline = await runEarlySignalPipeline({ watcherIds: [watcherId] });
    await recordSourceRun({
      watcherId,
      triggerType: 'manual',
      finalFetchMethod: (watcher.config as { extractionMethod?: string }).extractionMethod ?? watcher.adapterType,
      itemCount: pipeline.signalsCreated + pipeline.signalsUpdated,
      newCount: pipeline.signalsCreated,
      qualifiedCount: pipeline.signalsCreated,
      traceId: createHash('sha256').update(`${watcherId}:${Date.now()}`).digest('hex').slice(0, 16),
    });

    if (pipeline.signalsCreated > 0) {
      await db
        .update(sourceWatchers)
        .set({ lastNewItemDetected: new Date(), updatedAt: new Date() })
        .where(eq(sourceWatchers.id, watcherId));
    }

    return { ok: true, newItems: pipeline.signalsCreated, qualified: pipeline.signalsCreated };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scout run failed';
    await recordSourceRun({
      watcherId,
      triggerType: 'manual',
      sanitizedFailure: message.slice(0, 200),
    });
    return { ok: false, newItems: 0, qualified: 0, error: message };
  }
}

export { runEarlySignalPipeline };
