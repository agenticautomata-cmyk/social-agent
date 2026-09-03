/**
 * Seeds the hospitality source registry and checks the sources that are due.
 *
 * `--seed-only` writes the registry rows without fetching anything.
 * `--url=<url>` checks one source.
 * `--all` checks every enabled source regardless of schedule.
 */

import { checkSource, hasExtractor } from '../partnership-sources/check.js';
import {
  getSourceByUrl,
  listSources,
  listSourcesDueForCheck,
  seedSources,
  summarizeSourceHealth,
} from '../partnership-sources/registry.js';

const args = process.argv.slice(2);
const seedOnly = args.includes('--seed-only');
const all = args.includes('--all');
const urlArg = args.find((a) => a.startsWith('--url='))?.slice('--url='.length);

const seeded = await seedSources();
console.log(`Registry: ${seeded.inserted} inserted, ${seeded.updated} refreshed.`);

if (!seedOnly) {
  const targets = urlArg
    ? [await getSourceByUrl(urlArg)].filter((s): s is NonNullable<typeof s> => Boolean(s))
    : all
      ? await listSources()
      : await listSourcesDueForCheck();

  if (targets.length === 0) {
    console.log('No sources are due for a check.');
  }

  for (const source of targets) {
    if (!hasExtractor(source.url)) {
      // Fetching a page Benson cannot read yet spends a request for nothing and
      // risks looking like a crawler with no purpose. Skip it and say so.
      console.log(`- ${source.name}: skipped, no extractor built for this page yet.`);
      continue;
    }
    const result = await checkSource(source);
    console.log(`- ${result.explanation}`);
  }
}

const health = await summarizeSourceHealth();
console.log(`\nSource health across ${health.total} registered sources:`);
for (const [state, count] of Object.entries(health.byState).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${state}`);
}
if (health.needsAttention.length > 0) {
  console.log('\nNeeds a human look:');
  for (const item of health.needsAttention) console.log(`  - ${item.name}: ${item.explanation}`);
} else {
  console.log('\nNothing needs a human look.');
}

process.exit(0);
