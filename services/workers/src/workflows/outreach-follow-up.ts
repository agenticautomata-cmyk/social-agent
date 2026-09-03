import { processDueOutreachFollowUps } from '@social-agent/core/sponsor-outreach';
import { createCronWorker } from '../runtime.js';

// Instrumented for the same reason as benson-outreach-drafting: this worker writes to
// Kellie's approval queue and previously had no worker_job_runs history or heartbeat.
export const outreachFollowUpWorker = createCronWorker({
  name: 'outreach-follow-up',
  intervalMs: 6 * 60 * 60 * 1000,
  initialDelayMs: 8 * 60 * 1000,
  run: async () => {
    const result = await processDueOutreachFollowUps();
    if (result.drafted.length > 0 || result.processed > 0) {
      console.log(
        `[outreach-follow-up] drafted=${result.drafted.length} processed=${result.processed}`,
      );
    }
  },
});
