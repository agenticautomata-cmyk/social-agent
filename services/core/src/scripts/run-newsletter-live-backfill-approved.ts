/**
 * Controlled live backfill from the approved reclassified pinned report.
 * Requires NEWSLETTER_LIVE_BACKFILL confirmation. Does not re-OCR.
 */
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(scriptDir, '../../../../.env') });

const {
  persistApprovedNewsletterBackfill,
  APPROVED_CORPUS_HASH,
} = await import('../newsletter-intelligence/live-persist-approved.js');

async function main() {
  const live = process.env.NEWSLETTER_LIVE === '1';
  const confirm = process.env.NEWSLETTER_CONFIRM_LIVE_BACKFILL;
  const reportPath =
    process.env.NEWSLETTER_APPROVED_REPORT ??
    resolve(scriptDir, '../../../../reports/newsletter-dry-run-reclassified-2026-07-28T01-46-57-054Z.json');

  console.log(
    JSON.stringify(
      {
        mode: 'approved_pinned',
        live,
        reportPath,
        expectedCorpusHash: APPROVED_CORPUS_HASH,
      },
      null,
      2,
    ),
  );

  const result = await persistApprovedNewsletterBackfill({
    approvedReportPath: reportPath,
    live,
    confirmLiveBackfill: confirm as 'NEWSLETTER_LIVE_BACKFILL' | undefined,
    expectedCorpusHash: APPROVED_CORPUS_HASH,
  });

  const outDir = resolve(scriptDir, '../../../../reports');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = resolve(outDir, `newsletter-live-backfill-${live ? 'live' : 'dry'}-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ outPath, ...result }, null, 2));

  if (result.materialMismatch) {
    console.error('MATERIAL MISMATCH — stop and report');
    process.exit(3);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
