import postgres from 'postgres';
import { env } from '../env.js';
import { runPreAlphaMigrations } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await runPreAlphaMigrations(db);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Pre-alpha migration failed:', err);
  process.exit(1);
});
