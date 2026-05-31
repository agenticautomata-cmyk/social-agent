// Apply Phase 2F The Pitch KC Sipps dining source type migration.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { env } from '../env.js';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, '../../../../db/migrations/13_pitch_dining_source_type.sql');
const sql = readFileSync(sqlPath, 'utf8');

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  console.log('Applying 13_pitch_dining_source_type.sql...');
  await db.unsafe(sql);
  await db.end();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
