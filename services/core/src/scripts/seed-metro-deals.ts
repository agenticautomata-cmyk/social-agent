import 'dotenv/config';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, sources } from '../schema.js';
import { KC_METRO_DEALS_RSS_SOURCES } from '../discount-watch/sources.js';

async function defaultCampaignId(): Promise<string> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('No active campaign found');
  return campaign.id;
}

async function main() {
  const campaignId = await defaultCampaignId();
  let created = 0;
  let skipped = 0;

  for (const entry of KC_METRO_DEALS_RSS_SOURCES) {
    const exists = await db.query.sources.findFirst({
      where: and(eq(sources.campaignId, campaignId), eq(sources.name, entry.name)),
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    await db.insert(sources).values({
      campaignId,
      type: 'metro_deals',
      name: entry.name,
      config: {
        feedUrl: entry.feedUrl,
        strictDealFilter: entry.strictDealFilter,
        maxAgeDays: entry.maxAgeDays,
        excludeTitlePattern: 'excludeTitlePattern' in entry ? entry.excludeTitlePattern : undefined,
        limit: 60,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    created += 1;
    console.log(`  wired ${entry.name}`);
  }

  console.log(`Metro deals RSS seed: ${created} created, ${skipped} already existed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
