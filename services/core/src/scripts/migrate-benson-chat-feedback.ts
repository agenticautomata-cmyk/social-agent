import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '43',
      file: '43_benson_chat_feedback.sql',
      label: 'benson chat feedback',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Benson chat feedback migration failed:', err);
  process.exit(1);
});
