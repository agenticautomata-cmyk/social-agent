import { createCronWorker } from '../runtime.js';
import { env } from '@social-agent/core';
import { getGmailConnectionStatus } from '@social-agent/core/gmail-oauth';
import { GmailInboxError, listGmailMessageIds } from '@social-agent/core/gmail-inbox';
import { processDiscoveryEmailMessage } from '@social-agent/core/gmail-inbox';
import { classifyError } from '@social-agent/core/provider-errors';

const DISCOVERY_QUERY =
  'in:inbox newer_than:7d (to:discoveries@kckellie.com OR deliveredto:discoveries@kckellie.com)';

export const gmailDiscoverySyncWorker = createCronWorker({
  name: 'gmail-discovery-sync',
  intervalMs: env.GMAIL_DISCOVERY_SYNC_MS ?? 15 * 60 * 1000,
  initialDelayMs: 8000,
  run: async () => {
    if (env.DEMO_MODE) return { skipped: true, reason: 'demo_mode' };

    const connection = await getGmailConnectionStatus();
    if (connection.status !== 'connected') {
      console.warn(`[gmail-discovery-sync] skipped — Gmail ${connection.status}`);
      return { skipped: true, reason: connection.status };
    }

    try {
      const ids = await listGmailMessageIds(DISCOVERY_QUERY, 20);
      let processed = 0;
      for (const id of ids) {
        const result = await processDiscoveryEmailMessage(id);
        if (result.ok && !result.skipped) processed += 1;
      }
      return { scanned: ids.length, processed };
    } catch (err) {
      const classified = classifyError(
        err instanceof GmailInboxError ? err.message : err,
        'gmail',
      );
      console.warn(`[gmail-discovery-sync] ${classified.uiMessage}`);
      if (classified.retryable) {
        return { skipped: true, reason: classified.rootCause };
      }
      throw new Error(classified.uiMessage);
    }
  },
});
