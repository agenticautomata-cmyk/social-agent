import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '42',
      file: '42_benson_learnings.sql',
      label: 'benson self-learning insights',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Benson learning migration failed:', err);
  process.exit(1);
});
