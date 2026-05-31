// Apply Phase 2C Union Station source type migration.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { env } from '../env.js';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, '../../../../db/migrations/09_union_station_source_type.sql');
const sql = readFileSync(sqlPath, 'utf8');

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  console.log('Applying 09_union_station_source_type.sql...');
  await db.unsafe(sql);
  await db.end();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
