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
import { syncInstagramWatchersWithSharedSession } from '../curator-watchlist/instagram-session.js';
import {
  isEventbriteDirectoryWatcher,
  runEventbriteWatchlistCheck,
} from './eventbrite-watch.js';
import {
  isEventListingDirectoryWatcher,
  runEventListingWatchlistCheck,
} from './event-listing-watch.js';

export async function runWatcherNow(watcherId: string): Promise<{
  ok: boolean;
  newItems: number;
  qualified: number;
  error?: string;
  inspectionSummary?: string;
}> {
  let [watcher] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, watcherId)).limit(1);
  if (!watcher) return { ok: false, newItems: 0, qualified: 0, error: 'Source not found' };

  if (watcher.platform === 'instagram') {
    await syncInstagramWatchersWithSharedSession();
    const [refreshed] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, watcherId)).limit(1);
    if (refreshed) watcher = refreshed;
  }

  // needs_setup Eventbrite homepage can still be "checked" once to surface the explanation,
  // but paused sources that are not Eventbrite setup cases remain blocked.
  const isEventbrite = isEventbriteDirectoryWatcher(watcher);
  const isEventListing = !isEventbrite && isEventListingDirectoryWatcher(watcher);
  if ((watcher.paused || !watcher.enabled) && !(isEventbrite && watcher.healthStatus === 'needs_setup')) {
    return { ok: false, newItems: 0, qualified: 0, error: 'Source is paused or disabled' };
  }

  if (isEventbrite) {
    // Eventbrite path never routes through alert-capable early-signal pipeline.
    return runEventbriteWatchlistCheck(watcherId, 'manual');
  }

  if (isEventListing) {
    // Event listing path never routes through alert-capable early-signal pipeline.
    return runEventListingWatchlistCheck(watcherId, 'manual');
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
        inspectionSummary: result.inspectionSummary,
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
    const pipeline = await runEarlySignalPipeline({ watcherIds: [watcherId], suppressAlerts: true });
    await recordSourceRun({
      watcherId,
      triggerType: 'manual',
      finalFetchMethod: (watcher.config as { extractionMethod?: string }).extractionMethod ?? watcher.adapterType,
      itemCount: pipeline.signalsCreated + pipeline.signalsUpdated,
      newCount: pipeline.signalsCreated,
      qualifiedCount: pipeline.signalsCreated,
      traceId: createHash('sha256').update(`${watcherId}:${Date.now()}`).digest('hex').slice(0, 16),
      metadata: {
        inspectionSummary:
          pipeline.signalsCreated > 0
            ? `Extracted ${pipeline.signalsCreated} new signal(s)`
            : 'Check completed with no new signals',
      },
    });

    if (pipeline.signalsCreated > 0) {
      await db
        .update(sourceWatchers)
        .set({ lastNewItemDetected: new Date(), updatedAt: new Date() })
        .where(eq(sourceWatchers.id, watcherId));
    }

    return {
      ok: true,
      newItems: pipeline.signalsCreated,
      qualified: pipeline.signalsCreated,
      inspectionSummary:
        pipeline.signalsCreated > 0
          ? `Extracted ${pipeline.signalsCreated} new signal(s)`
          : 'Check completed with no new signals',
    };
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
