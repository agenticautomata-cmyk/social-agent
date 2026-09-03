import { env } from '@social-agent/core';
import { runBensonOutreachDraftingBatch } from '@social-agent/core/sponsor-outreach/benson-drafting';
import { shouldSkipBackgroundLlm } from '@social-agent/core/llm-spend';
import { createCronWorker } from '../runtime.js';

// This worker and outreach-follow-up were the only two in the system with zero rows in
// worker_job_runs all-time — they created pitches with no telemetry, so a silent stop
// would have shown as "all green". createCronWorker records a run start, success or
// failure and a heartbeat on every tick.
export const bensonOutreachDraftingWorker = createCronWorker({
  name: 'benson-outreach-drafting',
  intervalMs: 24 * 60 * 60 * 1000,
  initialDelayMs: 5 * 60 * 1000,
  run: async () => {
    if (env.DEMO_MODE && !env.BENSON_AUTO_DRAFT_ENABLED) {
      console.log('[benson-outreach-drafting] skipped: demo mode with auto-draft disabled');
      return;
    }
    if (!env.OPENAI_API_KEY?.trim()) {
      console.log('[benson-outreach-drafting] skipped: no OPENAI_API_KEY');
      return;
    }
    const gate = await shouldSkipBackgroundLlm('outreach');
    if (gate.skip) {
      console.log(`[benson-outreach-drafting] skipped: llm budget gate (${gate.reason ?? 'gated'})`);
      return;
    }
    const result = await runBensonOutreachDraftingBatch();
    console.log(
      `[benson-outreach-drafting] drafted=${result.drafted} skipped=${result.skipped.length}` +
        (result.drafted > 0 ? ` ids=${result.emailIds.join(',')}` : '') +
        (result.skipped.length > 0 ? ` reasons=${result.skipped.slice(0, 3).join('; ')}` : ''),
    );
  },
});
