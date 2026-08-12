import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '84',
    file: '84_benson_state_authority.sql',
    label: 'benson state authority producer fields',
    requires: ['outreach_inbound_messages', 'creator_skipped_records'],
  });
} finally {
  await db.end();
}
