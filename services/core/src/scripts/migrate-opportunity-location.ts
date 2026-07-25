import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const sqlPath = resolve(here, '../../../../db/migrations/63_opportunity_location.sql');
  const migration = readFileSync(sqlPath, 'utf8');
  const sql = postgres(url);
  console.log('Applying 63_opportunity_location.sql...');
  await sql.unsafe(migration);
  await sql.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
