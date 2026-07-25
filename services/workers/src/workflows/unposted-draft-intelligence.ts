import { env } from '@social-agent/core';
import { claimNextDraftForProcessing, processDraftAsset } from '@social-agent/core/draft-intelligence';
import { createCronWorker } from '../runtime.js';

export const unpostedDraftWorker = createCronWorker({
  name: 'unposted-draft-intelligence',
  intervalMs: env.INTAKE_MEDIA_WORKER_MS,
  initialDelayMs: 6000,
  run: async () => {
    const draftId = await claimNextDraftForProcessing();
    if (!draftId) return { processed: 0 };
    await processDraftAsset(draftId);
    return { processed: 1, draftId };
  },
});
