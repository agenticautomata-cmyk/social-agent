#!/usr/bin/env -S pnpm exec tsx
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
async function loadEnv() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch {
    // ignore
  }
}
await loadEnv();

const { db } = await import('../services/core/src/db.js');
const { sql } = await import('drizzle-orm');

async function run(label: string, query: ReturnType<typeof sql>) {
  console.log(`\n=== ${label} ===`);
  try {
    const rows = await db.execute(query);
    console.log(JSON.stringify(rows, null, 2).slice(0, 6000));
  } catch (err) {
    console.log('ERROR:', err instanceof Error ? err.message : err);
  }
}

await run(
  'Flower Child - content_items',
  sql`SELECT id, topic, lifecycle_status, processing_status, created_at, updated_at FROM content_items WHERE topic ILIKE '%flower child%' LIMIT 5`,
);
await run(
  'Flower Child - sponsor_contacts',
  sql`SELECT id, business_name, status, contact_verification_status, last_contacted_at, next_follow_up_at FROM sponsor_contacts WHERE business_name ILIKE '%flower child%'`,
);
await run(
  '21c - sponsor_contacts',
  sql`SELECT id, business_name, status, contact_name, contact_email, contact_verification_status, last_contacted_at, created_at FROM sponsor_contacts WHERE business_name ILIKE '%21c%'`,
);
await run(
  'Adidas - sponsor_contacts',
  sql`SELECT id, business_name, status, contact_name, contact_email, contact_verification_status, last_contacted_at, created_at FROM sponsor_contacts WHERE business_name ILIKE '%adidas%'`,
);
await run(
  'outreach_emails for 21c/Adidas/Flower Child',
  sql`SELECT oe.id, sc.business_name, oe.status, oe.pitch_readiness_status, oe.created_at, oe.sent_at
      FROM outreach_emails oe JOIN sponsor_contacts sc ON sc.id = oe.sponsor_contact_id
      WHERE sc.business_name ILIKE '%21c%' OR sc.business_name ILIKE '%adidas%' OR sc.business_name ILIKE '%flower child%'
      ORDER BY oe.created_at DESC`,
);
await run(
  'outreach_send_attempts for those emails',
  sql`SELECT osa.id, sc.business_name, osa.status, osa.provider, osa.created_at
      FROM outreach_send_attempts osa
      JOIN outreach_emails oe ON oe.id = osa.outreach_email_id
      JOIN sponsor_contacts sc ON sc.id = oe.sponsor_contact_id
      WHERE sc.business_name ILIKE '%21c%' OR sc.business_name ILIKE '%adidas%' OR sc.business_name ILIKE '%flower child%'
      ORDER BY osa.created_at DESC`,
);
await run(
  'Don Felder - content_items',
  sql`SELECT id, topic, lifecycle_status, processing_status, created_at, updated_at, source_url FROM content_items WHERE topic ILIKE '%don felder%' OR summary ILIKE '%don felder%' LIMIT 10`,
);
await run(
  'Don Felder - creator_skipped_records',
  sql`SELECT id, content_item_id, match_key, fingerprint, reason, created_at FROM creator_skipped_records WHERE reason ILIKE '%felder%' OR match_key ILIKE '%felder%' LIMIT 10`,
);
await run(
  'Charles Edward Carson - content_items',
  sql`SELECT id, topic, lifecycle_status, category, metadata->>'openingCategory' as opening_category, created_at FROM content_items WHERE topic ILIKE '%charles edward carson%' OR topic ILIKE '%carson%' LIMIT 10`,
);

process.exit(0);
