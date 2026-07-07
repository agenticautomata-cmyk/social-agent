import { createCronWorker } from '../runtime.js';
import { dispatchDueOutreachEmails } from '@social-agent/core/sponsor-outreach/dispatch';

export const outreachDispatchWorker = createCronWorker({
  name: 'outreach-dispatch',
  intervalMs: 5 * 60 * 1000,
  initialDelayMs: 45_000,
  run: async () => {
    const result = await dispatchDueOutreachEmails();
    if (result.checked > 0) {
      console.log(
        `[outreach-dispatch] checked=${result.checked} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
      );
      if (result.errors.length > 0) {
        console.warn('[outreach-dispatch] errors:', result.errors.slice(0, 3).join('; '));
      }
    }
  },
});
