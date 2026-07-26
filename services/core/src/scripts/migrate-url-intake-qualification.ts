import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '77',
    file: '77_url_intake_qualification.sql',
    label: 'URL intake qualification',
    requires: ['content_items', 'source_watchers'],
    priorCommand: 'pnpm migrate:curator-watchlist',
  });
} finally {
  await db.end();
}
