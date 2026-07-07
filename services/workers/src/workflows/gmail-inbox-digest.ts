import { runGmailTelegramDigest } from '@social-agent/core/gmail-inbox';
import { env } from '@social-agent/core';
import { createCronWorker } from '../runtime.js';

const INTERVAL_MS = env.GMAIL_DIGEST_INTERVAL_MS ?? 2_700_000;

export const gmailInboxDigestWorker = createCronWorker({
  name: 'gmail-inbox-digest',
  intervalMs: INTERVAL_MS,
  initialDelayMs: 5 * 60 * 1000,
  run: async () => {
    if (env.DEMO_MODE || !env.GMAIL_DIGEST_ENABLED) return;
    try {
      const result = await runGmailTelegramDigest();
      if (result.newMessages > 0) {
        console.log(
          `[gmail-inbox-digest] messages=${result.newMessages} telegram=${result.telegramSent}`,
        );
      }
      if (result.errors.length > 0) {
        console.warn('[gmail-inbox-digest] errors:', result.errors.slice(0, 3).join('; '));
      }
    } catch (err) {
      console.warn('[gmail-inbox-digest] failed:', err instanceof Error ? err.message : err);
    }
  },
});
