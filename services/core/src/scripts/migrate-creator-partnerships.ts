import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '81',
    file: '81_creator_partnerships.sql',
    label: 'creator partnerships workflow',
    requires: ['content_items'],
  });
} finally {
  await db.end();
}
