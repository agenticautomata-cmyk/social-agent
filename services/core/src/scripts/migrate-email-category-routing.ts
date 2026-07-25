import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { reclassifyRecentInboundEmail } from '../gmail-inbox/inbox-unified.js';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const sqlPath = resolve(here, '../../../../db/migrations/62_email_category_routing.sql');
  const migration = readFileSync(sqlPath, 'utf8');
  const sql = postgres(url);
  console.log('Applying 62_email_category_routing.sql...');
  await sql.unsafe(migration);
  const result = await reclassifyRecentInboundEmail(500);
  console.log('Reclassification:', result);
  await sql.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
