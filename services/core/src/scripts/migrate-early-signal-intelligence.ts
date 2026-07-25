import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '67',
      file: '67_early_signal_intelligence.sql',
      label: 'early signal intelligence',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Early signal intelligence migration failed:', err);
  process.exit(1);
});
