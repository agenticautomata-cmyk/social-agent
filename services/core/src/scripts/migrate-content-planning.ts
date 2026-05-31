import postgres from 'postgres';
import { env } from '../env.js';
import { PRE_ALPHA_MIGRATION_STEPS, applyMigrationFile } from './migration-runner.js';

const step = PRE_ALPHA_MIGRATION_STEPS.find((s) => s.id === '26')!;

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
