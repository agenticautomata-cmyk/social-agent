import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '86',
    file: '86_watch_source_canonical_key_unique.sql',
    label: 'Watch-source canonical_key partial unique index for ON CONFLICT upserts',
    requires: ['source_watchers'],
    priorCommand: 'pnpm migrate:watch-source-canonical-identity --apply',
  });
} finally {
  await db.end();
}
