import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns } from '../schema.js';
import { promotePendingAskBensonProposals } from '../source-ingestion/register-scrape-source.js';
import { listSourceRegistry } from '../source-ingestion/registry.js';

async function main() {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('No active campaign');

  const registered = await promotePendingAskBensonProposals(campaign.id);
  const registry = await listSourceRegistry();
  const bensonScrape = registry.filter(
    (entry) => entry.sourceType === 'scrape' && entry.sourceName.startsWith('[Benson]'),
  );

  console.log('Promoted pending Ask Benson proposals:', registered);
  console.log('Benson scrape sources in registry:', bensonScrape.length);
  for (const source of bensonScrape) {
    console.log(' -', source.sourceName, '|', source.feedUrl);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
