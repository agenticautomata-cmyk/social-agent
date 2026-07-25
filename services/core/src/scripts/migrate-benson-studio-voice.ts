import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '71',
    file: '71_benson_studio_voice.sql',
    label: 'Benson Studio Voice (Voicebox)',
    requires: ['benson_chat_messages', 'creator_accounts', 'benson_data_revisions'],
    priorCommand: 'pnpm migrate:ask-benson',
  });
} finally {
  await db.end();
}
