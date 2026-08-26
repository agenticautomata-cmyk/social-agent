import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '87',
    file: '87_calendar_category_snoozes.sql',
    label: 'Calendar category snoozes (operator attention filter)',
    requires: ['creator_calendar_items'],
    priorCommand: 'pnpm migrate:creator-calendar --apply',
  });
} finally {
  await db.end();
}
