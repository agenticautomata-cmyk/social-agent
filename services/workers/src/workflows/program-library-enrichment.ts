// Program Library auto-enrichment — one saved program per 6h worker cycle.

import { env } from '@social-agent/core';
import { runProgramLibraryAutoEnrichmentCycle } from '@social-agent/core/program-library';
import { createCronWorker } from '../runtime.js';

export const programLibraryEnrichmentWorker = createCronWorker({
  name: 'program-library-enrichment',
  intervalMs: env.PROGRAM_LIBRARY_ENRICHMENT_INTERVAL_MS,
  initialDelayMs: 180_000,
  run: async () => {
    const result = await runProgramLibraryAutoEnrichmentCycle();
    console.log(
      `[program-library-enrichment] ran=${result.ran} program=${result.programId ?? 'none'} searches=${result.searchCalls} skip=${result.skipReason ?? 'none'}`,
    );
    return result;
  },
});
