// Nightly: recompute temporal lifecycle, then hard-delete past retention only.
// Currentness = lifecycle recompute. Retention delete ≠ currentness.

import { env } from '@social-agent/core';
import { runExpiredEventSweep } from '@social-agent/core/inventory';
import { createCronWorker } from '../runtime.js';

export const expiredEventSweepWorker = createCronWorker({
  name: 'expired-event-sweep',
  intervalMs: env.BENSON_EXPIRED_SWEEP_MS,
  initialDelayMs: 3 * 60_000,
  run: async () => {
    const result = await runExpiredEventSweep();
    console.log(
      `[expired-event-sweep] lifecycle_updated=${result.lifecycleRecompute.updated}` +
        ` lifecycle_scanned=${result.lifecycleRecompute.scanned}` +
        ` retention_scanned=${result.scanned} deleted=${result.deleted}` +
        (result.sampleTitles[0] ? ` sample="${result.sampleTitles[0]}"` : ''),
    );
    return result;
  },
});
