import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const step = {
  id: '33',
  file: '33_source_ingestion_freshness.sql',
  label: 'source ingestion freshness',
  requires: ['content_items', 'sources'],
  priorCommand: 'pnpm migrate:pre-alpha',
};

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, step);
  } finally {
    await db.end();
  }
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
