// Opportunity refresh — periodically re-scrape all active sources, then score
// any unscored items with the Benson scoring model (metadata.bensonScore).

import { env } from '@social-agent/core';
import { featureFlags } from '@social-agent/core/feature-flags';
import { refreshAllSources } from '@social-agent/core/source-ingestion';
import { scoreUnscoredItems } from '@social-agent/core/opportunity-scoring';
import { createCronWorker } from '../runtime.js';

export const opportunityRefreshWorker = createCronWorker({
  name: 'opportunity-refresh',
  intervalMs: env.BENSON_OPPORTUNITY_REFRESH_MS,
  initialDelayMs: 2 * 60_000,
  run: async () => {
    if (featureFlags.enableKcScanner) {
      try {
        const refresh = await refreshAllSources();
        console.log(
          `[opportunity-refresh] sources refreshed — created=${refresh.totals.created} updated=${refresh.totals.updated} failed=${refresh.totals.failed}`,
        );
      } catch (err) {
        console.warn('[opportunity-refresh] refresh failed:', err instanceof Error ? err.message : err);
      }
    } else {
      console.log('[opportunity-refresh] ENABLE_KC_SCANNER not set — skipping source refresh');
    }

    const scoring = await scoreUnscoredItems();
    console.log(
      `[opportunity-refresh] scoring — scanned=${scoring.scanned} scored=${scoring.scored} batches=${scoring.batches} errors=${scoring.errors}`,
    );

    if (scoring.scored > 0) {
      try {
        const { sendBensonPush } = await import('@social-agent/core/push-notifications');
        await sendBensonPush({
          topic: 'top_picks',
          title: 'Benson · top picks',
          body: `${scoring.scored} new opportunit${scoring.scored === 1 ? 'y' : 'ies'} scored`,
          url: '/editor',
        });
      } catch (err) {
        console.warn('[opportunity-refresh] push failed:', err instanceof Error ? err.message : err);
      }
    }
  },
});
