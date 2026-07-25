import { createCronWorker } from '../runtime.js';
import { env } from '@social-agent/core';
import { listGmailMessageIds } from '@social-agent/core/gmail-inbox';
import { processDiscoveryEmailMessage } from '@social-agent/core/gmail-inbox';

const DISCOVERY_QUERY =
  'in:inbox newer_than:7d (to:discoveries@kckellie.com OR deliveredto:discoveries@kckellie.com)';

export const gmailDiscoverySyncWorker = createCronWorker({
  name: 'gmail-discovery-sync',
  intervalMs: env.GMAIL_DISCOVERY_SYNC_MS ?? 15 * 60 * 1000,
  initialDelayMs: 8000,
  run: async () => {
    const ids = await listGmailMessageIds(DISCOVERY_QUERY, 20);
    let processed = 0;
    for (const id of ids) {
      const result = await processDiscoveryEmailMessage(id);
      if (result.ok && !result.skipped) processed += 1;
    }
    return { scanned: ids.length, processed };
  },
});
