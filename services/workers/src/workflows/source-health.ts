// Source health — daily check of every active source feed URL. Auto-disables
// chronically broken sources and proposes replacements via web research.

import { env } from '@social-agent/core';
import { runSourceHealthCheck } from '@social-agent/core/source-health';
import { createCronWorker } from '../runtime.js';

export const sourceHealthWorker = createCronWorker({
  name: 'source-health',
  intervalMs: env.BENSON_SOURCE_HEALTH_MS,
  initialDelayMs: 10 * 60_000,
  run: async () => {
    await runSourceHealthCheck({ proposeReplacements: true });
  },
});
