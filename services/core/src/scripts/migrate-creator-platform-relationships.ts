import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '83',
    file: '83_creator_platform_relationships.sql',
    label: 'creator platform relationships',
    requires: ['creator_partnership_activities'],
  });
} finally {
  await db.end();
}
