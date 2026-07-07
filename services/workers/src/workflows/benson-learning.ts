// Benson self-learning — synthesize durable insights from feedback, planner, and performance.

import { env } from '@social-agent/core';
import { runBensonLearningCycle } from '@social-agent/core/benson-learning';
import { createCronWorker } from '../runtime.js';

export const bensonLearningWorker = createCronWorker({
  name: 'benson-learning',
  intervalMs: env.BENSON_LEARNING_INTERVAL_MS,
  initialDelayMs: 120_000,
  run: async () => {
    const result = await runBensonLearningCycle();
    console.log(`[benson-learning] ran=${result.ran} reason=${result.reason}`);
  },
});
