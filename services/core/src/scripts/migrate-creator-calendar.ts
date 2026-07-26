import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '73',
    file: '73_creator_calendar.sql',
    label: 'creator calendar and google calendar sync',
    requires: ['benson_data_revisions'],
    priorCommand: 'pnpm migrate:creator-calendar',
  });
} finally {
  await db.end();
}
