import 'dotenv/config';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../../.env') });

import { ingestPlaybookSources } from '../tiktok-playbook/ingest.js';

async function main() {
  console.log('Benson TikTok Creator Playbook — ingesting from ~/Downloads...\n');
  const result = await ingestPlaybookSources();
  for (const item of result.items) {
    console.log(
      `${item.documentFound ? '✅' : '⚠️'} ${item.name}: ${item.message}${item.chunkCount ? ` (${item.chunkCount} chunks)` : ''}`,
    );
  }
  if (result.errors.length) {
    console.error('\nErrors:');
    result.errors.forEach((e) => console.error(`  - ${e}`));
  }
  console.log('\nDone.');
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
