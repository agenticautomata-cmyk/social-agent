import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '85',
    file: '85_benson_conversations.sql',
    label: 'Benson Workspace conversation metadata and deterministic backfill',
    requires: ['creator_accounts', 'creator_partnerships', 'benson_chat_messages'],
  });
} finally {
  await db.end();
}
