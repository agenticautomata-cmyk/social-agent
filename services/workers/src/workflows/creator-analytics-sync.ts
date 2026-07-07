// Nightly read-only sync for TikTok + Meta (Facebook Page + Instagram) analytics.

import {
  runCreatorAnalyticsSync,
} from '@social-agent/core/creator-analytics-sync';
import { createCronWorker } from '../runtime.js';

const NIGHTLY_MS = 24 * 60 * 60 * 1000;

export const creatorAnalyticsSyncWorker = createCronWorker({
  name: 'creator-analytics-sync',
  intervalMs: NIGHTLY_MS,
  run: async () => {
    try {
      const result = await runCreatorAnalyticsSync({ trigger: 'scheduled' });
      const ok = result.results.filter((r) => r.ok && !r.skipped).length;
      const failed = result.results.filter((r) => !r.ok).length;
      console.log(
        `[creator-analytics-sync] done — ${ok} synced, ${failed} failed, ${result.results.length} providers`,
      );
    } catch (err) {
      console.warn('[creator-analytics-sync] skipped:', err);
    }
  },
});
