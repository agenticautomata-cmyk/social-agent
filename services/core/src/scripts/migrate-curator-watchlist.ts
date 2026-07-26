import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '76',
    file: '76_curator_watchlist_intelligence.sql',
    label: 'Curator watchlist intelligence',
    requires: ['source_watchers', 'scout_items', 'early_signals', 'creator_calendar_items'],
    priorCommand: 'pnpm migrate:calendar-dismiss-population',
  });
} finally {
  await db.end();
}
