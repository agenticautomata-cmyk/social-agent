// Nightly cleanup — hard-delete opportunities whose event dates are past retention.
// Keeps Opportunities / Ask Benson / learning free of Mecum-2019-style junk.

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
      `[expired-event-sweep] scanned=${result.scanned} deleted=${result.deleted}` +
        (result.sampleTitles[0] ? ` sample="${result.sampleTitles[0]}"` : ''),
    );
    return result;
  },
});
