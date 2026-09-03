// Partnership sources check — weekly due-source health for hospitality registry.
// Only runs pages with real extractors; never invents healthy for unchecked URLs.

import { runDuePartnershipSourceChecks } from '@social-agent/core/partnership-sources';
import { createCronWorker } from '../runtime.js';

/** ~24h — matches Tier-1 weekly/monthly schedules via next_scheduled_check_at. */
const INTERVAL_MS = 24 * 60 * 60_000;

export const partnershipSourcesCheckWorker = createCronWorker({
  name: 'partnership-sources-check',
  intervalMs: INTERVAL_MS,
  initialDelayMs: 15 * 60_000,
  run: async () => {
    const cycle = await runDuePartnershipSourceChecks({ seed: true });
    console.log(
      `[partnership-sources-check] checked=${cycle.checked} skipped_no_extractor=${cycle.skippedNoExtractor}` +
        ` seeded=${cycle.seeded.inserted}+${cycle.seeded.updated}`,
    );
    return {
      checked: cycle.checked,
      skippedNoExtractor: cycle.skippedNoExtractor,
      byState: cycle.healthSummary.byState,
    };
  },
});
