import 'dotenv/config';
import { retireFollowers5000Milestone } from '../push-notifications/milestones.js';
import { seedCityCoverageSources } from '../source-ingestion/city-coverage-sources.js';

async function main() {
  await retireFollowers5000Milestone();
  console.log('Retired followers_5000 milestone (no more 5K celebration).');

  const sources = await seedCityCoverageSources();
  console.log(
    `KC sources: ${sources.created} created, ${sources.skipped} skipped, thrift=${sources.thriftCreated ? 'new' : 'exists'}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
