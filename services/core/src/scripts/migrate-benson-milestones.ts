import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '46',
      file: '46_benson_milestones.sql',
      label: 'benson milestone celebrations',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Benson milestones migration failed:', err);
  process.exit(1);
});
