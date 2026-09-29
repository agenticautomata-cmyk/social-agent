import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '92',
      file: '92_muse_agent_ingest.sql',
      label: 'Muse agent ingest',
      requires: ['content_items', 'opening_locations'],
      priorCommand: 'pnpm --filter @social-agent/core migrate:openings-radar',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
