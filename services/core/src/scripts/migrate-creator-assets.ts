import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '89',
    file: '89_creator_assets_media_kit_versions.sql',
    label:
      'Creator assets + media-kit versions (public-use approval, kit content hash, PDF pin)',
    requires: ['media_kits', 'outreach_emails'],
    priorCommand: 'pnpm migrate:hospitality-partnership',
  });
} finally {
  await db.end();
}
