import { env } from '@social-agent/core';
import { runEarlySignalPipeline, seedDefaultWatchers } from '@social-agent/core/early-signals';
import { createCronWorker } from '../runtime.js';

let seeded = false;

export const earlySignalsWorker = createCronWorker({
  name: 'early-signals',
  intervalMs: env.EARLY_SIGNALS_INTERVAL_MS,
  initialDelayMs: 90_000,
  run: async () => {
    if (!env.EARLY_SIGNALS_ENABLED) return;
    if (!seeded) {
      await seedDefaultWatchers();
      seeded = true;
    }
    const result = await runEarlySignalPipeline();
    if (result.signalsCreated > 0 || result.watchersFailed > 0) {
      console.log(
        `[early-signals] created=${result.signalsCreated} failedWatchers=${result.watchersFailed} alerts=${result.alertsSent}`,
      );
    }
    if (result.errors.length > 0) {
      console.warn('[early-signals] errors:', result.errors.slice(0, 3).join('; '));
    }
  },
});
