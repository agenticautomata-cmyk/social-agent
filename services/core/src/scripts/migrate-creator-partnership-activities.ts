import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '82',
    file: '82_creator_partnership_activities.sql',
    label: 'creator partnership activities',
    requires: ['creator_partnerships'],
  });
} finally {
  await db.end();
}
