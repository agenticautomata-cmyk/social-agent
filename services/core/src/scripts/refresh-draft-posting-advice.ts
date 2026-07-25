import 'dotenv/config';
import { inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorDraftAssets } from '../schema.js';
import { refreshDraftPostingAdvice } from '../draft-intelligence/actions.js';

const ELIGIBLE = [
  'analyzed',
  'needs_review',
  'ready_to_post',
  'hold',
  'revise',
  'scheduled',
] as const;

async function main() {
  const rows = await db
    .select({ id: creatorDraftAssets.id, draftTitle: creatorDraftAssets.draftTitle })
    .from(creatorDraftAssets)
    .where(inArray(creatorDraftAssets.status, [...ELIGIBLE]));

  console.log(`Refreshing posting advice for ${rows.length} draft(s)…`);
  let ok = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await refreshDraftPostingAdvice(row.id);
      if (!result) {
        failed += 1;
        console.warn(`  skip ${row.id} (${row.draftTitle ?? 'untitled'})`);
        continue;
      }
      ok += 1;
      console.log(`  ok ${row.id}: ${result.suggestedPostWindow ?? 'no window'}`);
    } catch (err) {
      failed += 1;
      console.error(`  fail ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Done — ${ok} refreshed, ${failed} skipped/failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
