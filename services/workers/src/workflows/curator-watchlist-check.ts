// Curator Watchlist Check — bounded Instagram account polling every ~4h.
// Never historical crawls. Shares a lock with manual Check now.

import {
  CURATOR_WATCHLIST_INTERVAL_MS,
  curatorWatchlistJitterMs,
  markSchedulerLive,
  runCuratorWatchlistCycle,
} from '@social-agent/core/curator-watchlist';
import { createCronWorker } from '../runtime.js';

void markSchedulerLive().catch(() => undefined);

export const curatorWatchlistCheckWorker = createCronWorker({
  name: 'curator-watchlist-check',
  intervalMs: CURATOR_WATCHLIST_INTERVAL_MS,
  // Stagger first run; add a small random jitter so reboots don't stampede.
  initialDelayMs: 3 * 60_000 + curatorWatchlistJitterMs(),
  run: async () => {
    await markSchedulerLive();
    const cycle = await runCuratorWatchlistCycle();
    if (cycle.skipped) {
      console.log(`[curator-watchlist-check] skipped — ${cycle.skipReason}`);
      return { skipped: true, reason: cycle.skipReason };
    }
    console.log(
      `[curator-watchlist-check] cycle complete — sources=${cycle.sourcesChecked}` +
        ` ok=${cycle.results.filter((r) => r.ok).length}`,
    );
    return {
      sourcesChecked: cycle.sourcesChecked,
      results: cycle.results.map((r) => ({
        watcherId: r.watcherId,
        ok: r.ok,
        newPosts: r.newPosts ?? 0,
        eventsExtracted: r.eventsExtracted ?? 0,
        reason: r.reason ?? null,
      })),
    };
  },
});
