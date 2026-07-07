import { syncGmailOutreachReplies } from '@social-agent/core/gmail-inbox';
import { env } from '@social-agent/core';
import { createCronWorker } from '../runtime.js';

const INTERVAL_MS = env.GMAIL_INBOX_SYNC_INTERVAL_MS ?? 600_000;

export const gmailInboxSyncWorker = createCronWorker({
  name: 'gmail-inbox-sync',
  intervalMs: INTERVAL_MS,
  initialDelayMs: 2 * 60 * 1000,
  run: async () => {
    if (env.DEMO_MODE) return;
    try {
      const result = await syncGmailOutreachReplies();
      if (result.newReplies > 0) {
        console.log(
          `[gmail-inbox-sync] newReplies=${result.newReplies} notified=${result.notified} scanned=${result.scanned}`,
        );
      }
      if (result.errors.length > 0) {
        console.warn('[gmail-inbox-sync] errors:', result.errors.slice(0, 3).join('; '));
      }
    } catch (err) {
      console.warn('[gmail-inbox-sync] failed:', err instanceof Error ? err.message : err);
    }
  },
});
