import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '90',
    file: '90_visual_production.sql',
    label:
      'Visual production (design projects/versions, fact snapshots, image-gen ledger)',
    requires: ['creator_assets'],
    priorCommand: 'pnpm migrate:creator-assets',
  });
} finally {
  await db.end();
}
