import { db } from '../db.js';
import { contentItems, scanRuns, sources } from '../schema.js';
import { isNotNull, desc } from 'drizzle-orm';

async function main() {
  const ingested = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      sourceUrl: contentItems.sourceUrl,
      sourceExternalId: contentItems.sourceExternalId,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(isNotNull(contentItems.sourceId))
    .limit(10);

  const runs = await db.select().from(scanRuns).orderBy(desc(scanRuns.startedAt)).limit(5);
  const src = await db.select().from(sources);

  console.log(JSON.stringify({ sources: src.length, ingested: ingested.length, runs, sample: ingested.slice(0, 3) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
