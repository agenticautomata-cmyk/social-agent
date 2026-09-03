/**
 * Queue-trust repair: backup, reclassify, quarantine junk/contactless rows.
 * Never deletes outreach history.
 *
 * Usage: pnpm exec tsx src/scripts/repair-approval-queue-trust.ts
 */

import postgres from 'postgres';
import { env } from '../env.js';
import { classifyOutreachEmail } from '../partnership-contracts/quarantine.js';

const db = postgres(env.DATABASE_URL, { max: 1 });
const stamp = '20260903_queue_trust';

console.log('Backing up outreach_emails and sponsor_contacts…');
await db.unsafe(`
  CREATE TABLE IF NOT EXISTS outreach_emails_backup_${stamp} AS
  SELECT * FROM outreach_emails WHERE false;
`);
await db.unsafe(`
  INSERT INTO outreach_emails_backup_${stamp}
  SELECT * FROM outreach_emails o
  WHERE NOT EXISTS (
    SELECT 1 FROM outreach_emails_backup_${stamp} b WHERE b.id = o.id
  );
`);
await db.unsafe(`
  CREATE TABLE IF NOT EXISTS sponsor_contacts_backup_${stamp} AS
  SELECT * FROM sponsor_contacts WHERE false;
`);
await db.unsafe(`
  INSERT INTO sponsor_contacts_backup_${stamp}
  SELECT * FROM sponsor_contacts c
  WHERE NOT EXISTS (
    SELECT 1 FROM sponsor_contacts_backup_${stamp} b WHERE b.id = c.id
  );
`);

const before = await db<{ n: number; quarantine_state: string }[]>`
  SELECT quarantine_state, count(*)::int AS n
  FROM outreach_emails
  WHERE status = 'needs_approval'
  GROUP BY 1
  ORDER BY n DESC
`;
console.log('Before needs_approval by quarantine:', before);

const junk = await db`
  SELECT e.id, c.business_name, e.subject, e.quarantine_state, e.created_at,
         c.email, c.contact_evidence_state, c.evidence_url, e.drafted_by,
         e.pitch_readiness_status, e.sponsor_contact_id
  FROM outreach_emails e
  JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
  WHERE e.subject ILIKE '%Casual Styles%'
     OR c.business_name ILIKE '%Casual Styles%'
  ORDER BY e.created_at DESC
`;
console.log('Junk pitch provenance:', JSON.stringify(junk, null, 2));

const rows = await db`
  SELECT
    e.id,
    e.status::text AS status,
    e.created_at,
    e.updated_at,
    e.pitch_readiness_status,
    e.quarantine_state,
    e.subject,
    e.body,
    c.business_name,
    c.email AS contact_email,
    c.notes AS contact_notes,
    c.contact_verification_status,
    c.contact_evidence_state::text AS contact_evidence_state,
    c.evidence_url
  FROM outreach_emails e
  JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
  WHERE e.status IN ('needs_approval', 'draft', 'scheduled')
`;

const updates: Array<{ id: string; state: string; reason: string | null }> = [];
for (const row of rows) {
  if (row.quarantine_state === 'quarantined_by_operator') continue;
  const decision = classifyOutreachEmail({
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    businessName: row.business_name,
    contactEmail: row.contact_email,
    contactNotes: row.contact_notes,
    contactVerificationStatus: row.contact_verification_status,
    contactEvidenceState: row.contact_evidence_state,
    pitchReadinessStatus: row.pitch_readiness_status,
    evidenceUrl: row.evidence_url,
    subject: row.subject,
    body: row.body,
  });
  if (row.quarantine_state !== decision.state) {
    updates.push({ id: row.id, state: decision.state, reason: decision.reason });
  }
}

console.log(`Applying ${updates.length} quarantine updates…`);
for (const update of updates) {
  await db`
    UPDATE outreach_emails
    SET quarantine_state = ${update.state},
        quarantine_reason = ${update.reason},
        quarantined_at = ${update.state === 'active' ? null : db`now()`},
        updated_at = now()
    WHERE id = ${update.id}
  `;
}

const after = await db<{ n: number; quarantine_state: string }[]>`
  SELECT quarantine_state, count(*)::int AS n
  FROM outreach_emails
  WHERE status = 'needs_approval'
  GROUP BY 1
  ORDER BY n DESC
`;
console.log('After needs_approval by quarantine:', after);

const activeQueue = await db`
  SELECT e.id, c.business_name, left(e.subject, 60) AS subject,
         c.email, c.contact_evidence_state, e.pitch_readiness_status
  FROM outreach_emails e
  JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
  WHERE e.status = 'needs_approval' AND e.quarantine_state = 'active'
  ORDER BY e.updated_at DESC
`;
console.log('Active needs_approval rows:', JSON.stringify(activeQueue, null, 2));
console.log('Quarantined this run:', updates.filter((u) => u.state !== 'active').length);

await db.end();
