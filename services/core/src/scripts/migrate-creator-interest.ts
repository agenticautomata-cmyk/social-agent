import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '69',
    file: '69_creator_interest.sql',
    label: 'creator interest and research jobs',
    requires: ['content_items', 'sources'],
  });
} finally {
  await db.end();
}
