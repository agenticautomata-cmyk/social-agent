// Benson autonomous KC web discovery — scouts the internet for new local opportunities.

import { env } from '@social-agent/core';
import { runBensonLocalDiscovery } from '@social-agent/core/benson-discovery';
import { createCronWorker } from '../runtime.js';

export const bensonDiscoveryWorker = createCronWorker({
  name: 'benson-discovery',
  intervalMs: env.BENSON_DISCOVERY_INTERVAL_MS,
  initialDelayMs: 180_000,
  run: async () => {
    const result = await runBensonLocalDiscovery();
    console.log(
      `[benson-discovery] ran=${result.ran} reason=${result.reason}` +
        (result.created != null ? ` created=${result.created}` : ''),
    );
  },
});
