import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '68',
    file: '68_creator_agent_corrective.sql',
    label: 'creator agent corrective build',
    requires: ['content_items', 'worker_heartbeats', 'sponsor_contacts', 'outreach_emails'],
  });
} finally {
  await db.end();
}
