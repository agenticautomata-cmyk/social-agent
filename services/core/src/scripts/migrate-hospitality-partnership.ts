import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(env.DATABASE_URL, { max: 1 });

try {
  await applyMigrationFile(db, {
    id: '88',
    file: '88_hospitality_partnership_contracts.sql',
    label:
      'Hospitality partnership contracts (contact evidence, compensation, source registry, quarantine, urgency)',
    requires: [
      'content_items',
      'sponsor_contacts',
      'outreach_emails',
      'outreach_inbound_messages',
      'creator_partnerships',
      'media_kits',
    ],
    priorCommand: 'pnpm migrate:sponsor-outreach && pnpm migrate:creator-partnerships',
  });
} finally {
  await db.end();
}
