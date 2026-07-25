import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '70',
    file: '70_data_revision_and_skip.sql',
    label: 'data revision counters and creator skip records',
    requires: ['content_items'],
  });
} finally {
  await db.end();
}
