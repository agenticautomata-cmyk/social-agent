// Apply Phase 2K revenue-alignment source type migration.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { env } from '../env.js';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, '../../../../db/migrations/20_revenue_alignment_source_types.sql');
const sql = readFileSync(sqlPath, 'utf8');

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  console.log('Applying 20_revenue_alignment_source_types.sql...');
  await db.unsafe(sql);
  await db.end();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
