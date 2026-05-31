import { scanAllActiveSources } from '../scanner/index.js';

async function main() {
  const result = await scanAllActiveSources();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
