// Analytics Ingest — pulls IG / TikTok metrics for published posts on a schedule.
// Snapshots taken at +1h, +6h, +1d, +3d, +1w after each post. Drives the
// planner's weight-modifier feedback loop.

import { analytics } from '@social-agent/core';
import { createCronWorker } from '../runtime.js';

export const analyticsIngestWorker = createCronWorker({
  name: 'analytics-ingest',
  intervalMs: 30 * 60 * 1000, // every 30 min
  run: async () => {
    const result = await analytics.ingestDueMetrics();
    if (result.fetched > 0 || result.errors > 0) {
      console.log(`[analytics-ingest] +${result.fetched} snapshots, ${result.errors} errors`);
    }
  },
});
