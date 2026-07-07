import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '45',
      file: '45_benson_push.sql',
      label: 'benson web push notifications',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Benson push migration failed:', err);
  process.exit(1);
});
