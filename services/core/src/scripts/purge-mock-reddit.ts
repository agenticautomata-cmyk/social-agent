import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { or, like, sql } from 'drizzle-orm';

async function main() {
  const deleted = await db
    .delete(contentItems)
    .where(
      or(
        like(contentItems.sourceExternalId, 'mock_%'),
        sql`${contentItems.metadata}->>'ingest' = 'reddit'`,
        sql`${contentItems.sourceUrl} LIKE '%/comments/mock%'`,
      ),
    )
    .returning({ id: contentItems.id, topic: contentItems.topic });

  console.log(`Removed ${deleted.length} mock/legacy reddit rows:`);
  for (const row of deleted) {
    console.log(`  - ${row.topic}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
