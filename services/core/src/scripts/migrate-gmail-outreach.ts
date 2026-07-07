import postgres from 'postgres';
import { applyMigrationFile } from './migration-runner.js';

const db = postgres(process.env.DATABASE_URL!);

try {
  await applyMigrationFile(db, {
    id: '49',
    file: '49_gmail_outreach.sql',
    label: 'gmail oauth + benson outreach draft metadata',
    requires: ['outreach_emails'],
    priorCommand: 'pnpm migrate:sponsor-outreach',
  });
} finally {
  await db.end();
}
