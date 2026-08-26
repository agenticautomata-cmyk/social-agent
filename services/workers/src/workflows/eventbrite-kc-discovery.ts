// Public Eventbrite Kansas City discovery — city/category HTML ItemList crawl.
// Default: dry-run (EVENTBRITE_KC_DISCOVERY_PERSIST=false). No OAuth / search API.

import { env } from '@social-agent/core';
import { runEventbriteKcDiscovery } from '@social-agent/core/eventbrite-kc-discovery';
import { createCronWorker } from '../runtime.js';

export const eventbriteKcDiscoveryWorker = createCronWorker({
  name: 'eventbrite-kc-discovery',
  intervalMs: env.EVENTBRITE_KC_DISCOVERY_INTERVAL_MS,
  initialDelayMs: 240_000,
  run: async () => {
    if (!env.EVENTBRITE_KC_DISCOVERY_ENABLED) {
      console.log('[eventbrite-kc-discovery] skipped (disabled)');
      return;
    }
    const persist = env.EVENTBRITE_KC_DISCOVERY_PERSIST === true;
    const result = await runEventbriteKcDiscovery({
      dryRun: !persist,
      persist,
      maxUniqueIds: 100,
      maxDetailFetches: 100,
    });
    console.log(
      `[eventbrite-kc-discovery] ran=${result.ran} dryRun=${result.dryRun}` +
        ` unique=${result.uniqueIdsFound} parsed=${result.detailParsedOk}` +
        ` wouldCreate=${result.wouldCreate} rejectedGeo=${result.rejectedGeography}` +
        ` created=${result.created} updated=${result.updated}`,
    );
  },
});
