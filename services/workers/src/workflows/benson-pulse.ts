// TikTok pulse — every 4 h (configurable): sync TikTok, detect deltas,
// pre-compute an in-voice progress brief via OpenAI when something changed.

import { env } from '@social-agent/core';
import { runTikTokPulse } from '@social-agent/core/benson-pulse';
import {
  maybePushActionReminders,
  maybePushPostReminders,
} from '@social-agent/core/push-notifications';
import { createCronWorker } from '../runtime.js';

export const bensonPulseWorker = createCronWorker({
  name: 'benson-pulse',
  intervalMs: env.BENSON_PULSE_INTERVAL_MS,
  initialDelayMs: 15_000,
  run: async () => {
    const result = await runTikTokPulse();
    console.log(
      `[benson-pulse] synced=${result.synced} changed=${result.changed} brief=${result.briefGenerated} (${result.reason})${result.syncError ? ` syncError=${result.syncError}` : ''}`,
    );
    try {
      await maybePushActionReminders();
    } catch (err) {
      console.warn('[benson-pulse] action push failed:', err instanceof Error ? err.message : err);
    }
    try {
      const postPush = await maybePushPostReminders();
      if (postPush.sent) {
        console.log('[benson-pulse] post reminder push sent');
      }
    } catch (err) {
      console.warn('[benson-pulse] post reminder push failed:', err instanceof Error ? err.message : err);
    }
  },
});
