import 'dotenv/config';
import { seedCityCoverageSources } from '../source-ingestion/city-coverage-sources.js';

async function main() {
  const result = await seedCityCoverageSources();
  console.log(
    `KC city coverage: ${result.created} scrape sources created, ${result.skipped} already existed, thrift=${result.thriftCreated ? 'created' : 'exists'}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
