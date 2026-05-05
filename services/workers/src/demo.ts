// Demo runner — flips the seeded campaign into autonomous mode and triggers
// the planner. Then exits. The actual progression happens in `pnpm dev:workers`
// (or the `pnpm dev:all` umbrella).

import { eq } from 'drizzle-orm';
import { db, campaigns, planner } from '@social-agent/core';

async function main() {
  console.log('[demo] flipping demo campaign to auto mode + planning a week');

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.name, 'Demo Brand'),
  });
  if (!campaign) {
    console.error('[demo] no demo campaign — run `pnpm seed` first');
    process.exit(1);
  }

  await db
    .update(campaigns)
    .set({ autonomyMode: 'auto' })
    .where(eq(campaigns.id, campaign.id));
  console.log(`[demo] campaign ${campaign.id} → autonomy_mode=auto`);

  const result = await planner.planUpcomingWeek(campaign.id);
  console.log(`[demo] planner created ${result.itemsCreated} items`);
  console.log(`[demo]   by type:     ${JSON.stringify(result.byType)}`);
  console.log(`[demo]   by industry: ${JSON.stringify(result.byIndustry)}`);

  console.log('');
  console.log('[demo] now run `pnpm dev:workers` (or `pnpm dev:all`) and watch them flow.');
  console.log('[demo] dashboard at http://localhost:3000');
  process.exit(0);
}

main().catch((err) => {
  console.error('[demo] fatal:', err);
  process.exit(1);
});
