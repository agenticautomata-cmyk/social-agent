// Scanner — polls configured KC sources (Reddit) and inserts raw opportunities.

import { scanAllActiveSources } from '@social-agent/core/scanner';
import { featureFlags } from '@social-agent/core/feature-flags';
import { createCronWorker } from '../runtime.js';

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h default

export const scannerWorker = createCronWorker({
  name: 'scanner',
  intervalMs: SCAN_INTERVAL_MS,
  run: async () => {
    if (!featureFlags.enableKcScanner) return;
    const result = await scanAllActiveSources();
    if (result.totalCreated > 0) {
      console.log(
        `[scanner] created ${result.totalCreated} opportunities across ${result.results.length} source(s)`,
      );
    }
  },
});
