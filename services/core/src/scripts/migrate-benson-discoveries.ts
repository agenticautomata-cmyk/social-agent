import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '44',
      file: '44_benson_discoveries.sql',
      label: 'benson autonomous discoveries',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Benson discoveries migration failed:', err);
  process.exit(1);
});
