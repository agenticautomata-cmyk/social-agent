import { countExpiredEvents, runExpiredEventSweep } from '../inventory/expire-sweep.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const before = await countExpiredEvents();
  console.log(`[expire-sweep] expired dated opportunities: ${before}`);
  const result = await runExpiredEventSweep({ dryRun });
  console.log(
    `[expire-sweep] ${dryRun ? 'dry-run' : 'done'} scanned=${result.scanned} deleted=${result.deleted}`,
  );
  for (const title of result.sampleTitles) {
    console.log(`  - ${title}`);
  }
  if (!dryRun) {
    const after = await countExpiredEvents();
    console.log(`[expire-sweep] remaining expired: ${after}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
