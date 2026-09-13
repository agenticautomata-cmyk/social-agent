/**
 * Ensure curator_event_leads has a unique (watcher_id, occurrence_fingerprint)
 * so concurrent Check now / scheduled runs cannot both claim "created".
 *
 * Dedupes any pre-existing fingerprint collisions (keeps oldest row).
 */
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

async function main() {
  await db.execute(sql`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY watcher_id, occurrence_fingerprint
          ORDER BY created_at ASC, id ASC
        ) AS rn
      FROM curator_event_leads
    )
    DELETE FROM curator_event_leads
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_curator_leads_watcher_fingerprint
    ON curator_event_leads (watcher_id, occurrence_fingerprint)
  `);

  console.log(
    JSON.stringify({
      ok: true,
      migration: 'uidx_curator_leads_watcher_fingerprint',
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
