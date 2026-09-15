import { and, eq, ne, sql } from 'drizzle-orm';
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
  isDostuffDirectoryWatcher,
  runDostuffWatchlistCheck,
} from './dostuff-watch.js';
import {
  isMeetupDirectoryWatcher,
  runMeetupWatchlistCheck,
} from './meetup-watch.js';
import {
  isEventListingDirectoryWatcher,
  runEventListingWatchlistCheck,
} from './event-listing-watch.js';
import { listingFeedSiblingOf, classifyListingSourceOverlap } from './source-overlap.js';

export async function runWatcherNow(watcherId: string): Promise<{
  ok: boolean;
  /** Compat alias — always equals newLogicalEvents when present. */
  newItems: number;
  /** Instagram curator: genuinely new logical events this run. */
  newLogicalEvents?: number;
  candidatesExtracted?: number;
  existingEventsUpdated?: number;
  provenanceAdded?: number;
  duplicatesSuppressed?: number;
  qualified: number;
  error?: string;
  inspectionSummary?: string;
  runId?: string;
}> {
  let [watcher] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, watcherId)).limit(1);
  if (!watcher) return { ok: false, newItems: 0, newLogicalEvents: 0, qualified: 0, error: 'Source not found' };

  if (watcher.platform === 'instagram') {
    await syncInstagramWatchersWithSharedSession();
    const [refreshed] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, watcherId)).limit(1);
    if (refreshed) watcher = refreshed;
  }

  // Same-origin listing feed that duplicates a stronger HTML calendar collection
  // (e.g. /events/feed/ vs /events/) → mark duplicate_source; preserve audit; do not
  // pretend the feed is a healthy independent website listing.
  const feedSibling = listingFeedSiblingOf(watcher.sourceUrl);
  if (
    feedSibling &&
    (watcher.platform === 'rss' ||
      watcher.adapterType === 'rss_feed' ||
      /\/feed\/?$/i.test(watcher.sourceUrl))
  ) {
    let siblingHost = '';
    try {
      siblingHost = new URL(feedSibling).hostname.toLowerCase();
    } catch {
      siblingHost = '';
    }
    const candidates = siblingHost
      ? await db
          .select()
          .from(sourceWatchers)
          .where(
            and(
              ne(sourceWatchers.id, watcherId),
              sql`position(${siblingHost} in lower(${sourceWatchers.sourceUrl})) > 0`,
            ),
          )
      : [];
    const stronger = candidates.find((row) => {
      try {
        const a = new URL(row.sourceUrl).href.replace(/\/$/, '').toLowerCase();
        const b = feedSibling.replace(/\/$/, '').toLowerCase();
        return a === b;
      } catch {
        return false;
      }
    });
    if (stronger) {
      const overlap = classifyListingSourceOverlap({
        candidateUrl: watcher.sourceUrl,
        authoritativeUrl: stronger.sourceUrl,
        candidateIsFeed: true,
      });
      if (overlap.disposition === 'duplicate_source' || overlap.disposition === 'superseded') {
        const now = new Date();
        const prior = (watcher.config && typeof watcher.config === 'object' ? watcher.config : {}) as Record<
          string,
          unknown
        >;
        const explanation = `Duplicate/superseded of stronger collection ${stronger.sourceUrl} (${overlap.reason}). Feed preserved for audit; not treated as an independent healthy listing.`;
        await db
          .update(sourceWatchers)
          .set({
            healthStatus: overlap.disposition,
            lastAttemptedCheck: now,
            lastSuccessfulCheck: now,
            config: {
              ...prior,
              statusExplanation: explanation,
              lastCheckOutcome: overlap.disposition,
              sourceOverlap: overlap,
              strongerWatcherId: stronger.id,
              strongerSourceUrl: stronger.sourceUrl,
              lastCheckCompletedOk: true,
              lastCompletedCheckAt: now.toISOString(),
              // Preserve prior extracted counts for audit — do not silent-delete.
            },
            updatedAt: now,
          })
          .where(eq(sourceWatchers.id, watcherId));
        await recordSourceRun({
          watcherId,
          triggerType: 'manual',
          finalFetchMethod: watcher.adapterType,
          itemCount: 0,
          newCount: 0,
          qualifiedCount: 0,
          metadata: {
            outcome: overlap.disposition,
            inspectionSummary: explanation,
            strongerWatcherId: stronger.id,
            strongerSourceUrl: stronger.sourceUrl,
          },
        });
        return {
          ok: true,
          newItems: 0,
          newLogicalEvents: 0,
          qualified: 0,
          inspectionSummary: explanation,
        };
      }
    }
  }

  // needs_setup Eventbrite homepage can still be "checked" once to surface the explanation,
  // but paused sources that are not Eventbrite setup cases remain blocked.
  const isEventbrite = isEventbriteDirectoryWatcher(watcher);
  const isDostuff = !isEventbrite && isDostuffDirectoryWatcher(watcher);
  const isMeetup = !isEventbrite && !isDostuff && isMeetupDirectoryWatcher(watcher);
  const isEventListing =
    !isEventbrite && !isDostuff && !isMeetup && isEventListingDirectoryWatcher(watcher);
  if ((watcher.paused || !watcher.enabled) && !(isEventbrite && watcher.healthStatus === 'needs_setup')) {
    return { ok: false, newItems: 0, newLogicalEvents: 0, qualified: 0, error: 'Source is paused or disabled' };
  }

  if (isEventbrite) {
    // Eventbrite path never routes through alert-capable early-signal pipeline.
    return runEventbriteWatchlistCheck(watcherId, 'manual');
  }

  if (isDostuff) {
    // DoStuff/Do816 path never routes through alert-capable early-signal pipeline.
    return runDostuffWatchlistCheck(watcherId, 'manual');
  }

  if (isMeetup) {
    // Meetup path never routes through alert-capable early-signal pipeline.
    return runMeetupWatchlistCheck(watcherId, 'manual');
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
        newLogicalEvents: 0,
        qualified: 0,
        error: 'A watchlist check is already running — try again in a few minutes',
      };
    }
    try {
      const result = await runScheduledCuratorWatcher(watcherId, 'manual');
      const newLogicalEvents = result.newLogicalEvents ?? result.eventsExtracted ?? 0;
      return {
        ok: result.ok,
        newItems: newLogicalEvents,
        newLogicalEvents,
        candidatesExtracted: result.candidatesExtracted,
        existingEventsUpdated: result.existingEventsUpdated,
        provenanceAdded: result.provenanceAdded,
        duplicatesSuppressed: result.duplicatesSuppressed,
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
