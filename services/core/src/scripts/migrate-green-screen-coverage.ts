import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, '../../../../db/migrations/60_green_screen_coverage.sql');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const sql = postgres(url);
  const migration = readFileSync(sqlPath, 'utf8');
  console.log('Applying 60_green_screen_coverage.sql...');
  await sql.unsafe(migration);
  await sql.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
