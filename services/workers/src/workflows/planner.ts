// Planner — runs every hour. Generates next-week content_items rows for every
// active campaign that has remaining quota. Idempotent.

import { planner } from '@social-agent/core';
import { createCronWorker } from '../runtime.js';

export const plannerWorker = createCronWorker({
  name: 'planner',
  intervalMs: 60 * 60 * 1000, // 1h
  run: async () => {
    const results = await planner.planAllActiveCampaigns();
    const total = results.reduce((s, r) => s + r.itemsCreated, 0);
    if (total > 0) {
      console.log(`[planner] created ${total} items across ${results.length} campaigns`);
    }
  },
});
