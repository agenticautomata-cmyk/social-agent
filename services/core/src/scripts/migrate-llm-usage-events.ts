import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '66',
      file: '66_llm_usage_events.sql',
      label: 'llm usage event tracking',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('LLM usage events migration failed:', err);
  process.exit(1);
});
