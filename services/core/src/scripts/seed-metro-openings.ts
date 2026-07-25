import 'dotenv/config';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, sources } from '../schema.js';

const METRO_OPENING_SOURCES = [
  {
    name: 'Johnson County Post Openings',
    feedUrl: 'https://johnsoncountypost.com/feed/',
    strictOpeningFilter: false,
    maxAgeDays: 90,
    excludeTitlePattern:
      'candidate|election|comic|standup|issues:|housing affordability|school board|newsletter|paywall',
  },
  {
    name: 'Flatland KC Openings',
    feedUrl: 'https://flatlandkc.org/feed/',
    strictOpeningFilter: false,
    maxAgeDays: 120,
  },
  {
    name: 'FOX4 KC Local Openings',
    feedUrl: 'https://www.fox4kc.com/news/local-news/feed/',
    strictOpeningFilter: true,
    maxAgeDays: 60,
  },
  {
    name: 'KSHB Local News Openings',
    feedUrl: 'https://www.kshb.com/news/local-news.rss',
    strictOpeningFilter: true,
    maxAgeDays: 60,
  },
] as const;

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

  for (const entry of METRO_OPENING_SOURCES) {
    const exists = await db.query.sources.findFirst({
      where: and(eq(sources.campaignId, campaignId), eq(sources.name, entry.name)),
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    await db.insert(sources).values({
      campaignId,
      type: 'metro_openings',
      name: entry.name,
      config: {
        feedUrl: entry.feedUrl,
        strictOpeningFilter: entry.strictOpeningFilter,
        maxAgeDays: entry.maxAgeDays,
        limit: 60,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    created += 1;
    console.log(`  wired ${entry.name}`);
  }

  console.log(`Metro openings seed: ${created} created, ${skipped} already existed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
