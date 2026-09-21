import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '91',
      file: '91_openings_radar.sql',
      label: 'Openings Radar',
      requires: ['content_items', 'creator_calendar_items'],
      priorCommand: 'pnpm migrate:calendar-dismiss-population (or ensure creator calendar exists)',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
