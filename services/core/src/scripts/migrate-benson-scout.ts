import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '72',
    file: '72_benson_scout_expansion.sql',
    label: 'Benson Scout expansion',
    requires: ['source_watchers', 'early_signals', 'benson_data_revisions'],
    priorCommand: 'pnpm migrate:benson-studio-voice',
  });
} finally {
  await db.end();
}
