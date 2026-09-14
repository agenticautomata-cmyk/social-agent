/**
 * Auditable Instagram event quality-gate backfill.
 * Usage:
 *   pnpm --filter @social-agent/core exec tsx src/scripts/backfill-instagram-event-quality-gate.ts
 *   pnpm --filter @social-agent/core exec tsx src/scripts/backfill-instagram-event-quality-gate.ts --handle=kcpldistrict
 */

import { eq, ilike, or } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import {
  runEventQualityGateBackfillForWatcher,
  runEventQualityGateBackfillGlobal,
} from '../curator-watchlist/instagram-visual-backfill.js';

async function main() {
  const handleArg = process.argv.find((a) => a.startsWith('--handle='))?.slice('--handle='.length);
  if (handleArg) {
    const handle = handleArg.replace(/^@/, '');
    const rows = await db
      .select()
      .from(sourceWatchers)
      .where(
        or(
          ilike(sourceWatchers.sourceName, `%${handle}%`),
          ilike(sourceWatchers.sourceUrl, `%${handle}%`),
        ),
      )
      .limit(10);
    const byUrl = rows.find((w) => w.platform === 'instagram') ?? rows[0];

    if (!byUrl) {
      console.error(JSON.stringify({ ok: false, error: `watcher_not_found:${handle}` }));
      process.exit(1);
    }
    const result = await runEventQualityGateBackfillForWatcher(byUrl.id);
    console.log(
      JSON.stringify(
        {
          ok: true,
          handle,
          watcherId: byUrl.id,
          sourceName: byUrl.sourceName,
          ...result,
        },
        null,
        2,
      ),
    );
    return;
  }

  const global = await runEventQualityGateBackfillGlobal();
  console.log(JSON.stringify({ ok: true, scope: 'global', ...global }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
