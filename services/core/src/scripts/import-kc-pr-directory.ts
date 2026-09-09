/**
 * Import Kansas City PR / Affiliate Directory into sponsor_contacts + program library.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/import-kc-pr-directory.ts --dry-run
 *   pnpm exec tsx src/scripts/import-kc-pr-directory.ts --apply
 *
 * Does not send email, Telegram, or submit forms.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadWorkbookFixture,
  planAndApplyWorkbookImport,
  summarizeBuckets,
} from '../contact-intelligence/index.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply || process.argv.includes('--dry-run');
  const fixtureArg = process.argv.find((a) => a.startsWith('--fixture='));
  const fixturePath = resolve(
    fixtureArg?.slice('--fixture='.length) ??
      new URL('../../../../docs/ops/fixtures/kc-pr-affiliate-directory-2026-09-08.json', import.meta.url)
        .pathname,
  );

  const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const bundle = loadWorkbookFixture(raw);
  console.log(
    JSON.stringify(
      {
        fixturePath,
        apply: !dryRun,
        outreachRows: bundle.outreach.length,
        programRows: bundle.programs.length,
        checkedDate: bundle.meta.checkedDate,
      },
      null,
      2,
    ),
  );

  const { summary, outreachMatches, programMatches } = await planAndApplyWorkbookImport({
    bundle,
    apply: !dryRun,
  });

  console.log('\n=== Match buckets (outreach) ===');
  console.log(summarizeBuckets(outreachMatches));
  console.log('\n=== Match buckets (programs) ===');
  console.log(summarizeBuckets(programMatches));
  console.log('\n=== Apply summary ===');
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) {
    console.log('\nDry run only — re-run with --apply to write.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
