import 'dotenv/config';
import { seedDiscountWatchSources } from '../discount-watch/index.js';

async function main() {
  const result = await seedDiscountWatchSources();
  console.log(
    `Discount watch: ${result.created} sources created, ${result.skipped} already existed`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
