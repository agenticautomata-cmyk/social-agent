import 'dotenv/config';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../../.env') });

import { seedEquipmentReferenceVideos } from '../equipment-expert/reference-videos.js';

async function main() {
  console.log('Seeding Gear Coach reference videos...\n');
  const result = await seedEquipmentReferenceVideos();
  console.log(`Inserted: ${result.inserted}, updated: ${result.updated}`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
