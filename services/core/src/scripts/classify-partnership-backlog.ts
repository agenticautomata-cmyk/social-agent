/**
 * One-time classification of the partnership backlog.
 *
 * Kellie's approval queue held 75 pitches with a 29-day median age, six of which were
 * smoke-test fixtures sitting at the top with the highest confidence badge in the UI.
 * Nothing here is deleted — every row keeps its history and stays viewable through the
 * "quarantined" filter. This only sets `quarantine_state` so weak, synthetic, stale and
 * non-business rows stop occupying her primary workflow.
 *
 * Also backfills `contact_evidence_state` from the legacy free-text
 * `contact_verification_status`, conservatively: anything that does not clearly
 * describe official published evidence lands on `inferred_unverified`.
 *
 * Idempotent. Re-running re-derives the same decision from the same data.
 * Pass `--dry-run` to print the distribution without writing.
 */

import postgres from 'postgres';

import { env } from '../env.js';
import {
  classifyCreatorPartnership,
  classifyOutreachEmail,
  classifySponsorContact,
  evidenceStateFromLegacyStatus,
  officialInboxStateForLocalPart,
  type QuarantineState,
} from '../partnership-contracts/index.js';
import { splitEmail } from '../sponsor-outreach/recipient-safety.js';

const dryRun = process.argv.includes('--dry-run');
const db = postgres(env.DATABASE_URL, { max: 1 });

type Tally = Record<string, number>;

function bump(tally: Tally, key: string): void {
  tally[key] = (tally[key] ?? 0) + 1;
}

function printTally(label: string, tally: Tally): void {
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  console.log(`\n${label} (${total} rows)`);
  for (const [key, n] of entries) {
    console.log(`  ${String(n).padStart(4)}  ${key}`);
  }
}

async function classifyOutreachEmails(): Promise<void> {
  const rows = await db<
    Array<{
      id: string;
      status: string;
      created_at: Date;
      updated_at: Date;
      pitch_readiness_status: string;
      quarantine_state: string;
      business_name: string | null;
      contact_email: string | null;
      contact_notes: string | null;
      contact_verification_status: string | null;
    }>
  >`
    SELECT
      e.id,
      e.status::text AS status,
      e.created_at,
      e.updated_at,
      e.pitch_readiness_status,
      e.quarantine_state,
      c.business_name,
      c.email AS contact_email,
      c.notes AS contact_notes,
      c.contact_verification_status
    FROM outreach_emails e
    JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
  `;

  const tally: Tally = {};
  const updates: Array<{ id: string; state: QuarantineState; reason: string | null }> = [];

  for (const row of rows) {
    const decision = classifyOutreachEmail({
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      businessName: row.business_name,
      contactEmail: row.contact_email,
      contactNotes: row.contact_notes,
      contactVerificationStatus: row.contact_verification_status,
      pitchReadinessStatus: row.pitch_readiness_status,
    });
    bump(tally, decision.state);
    // Never overwrite a deliberate operator decision with an automatic one.
    if (row.quarantine_state === 'quarantined_by_operator') continue;
    if (row.quarantine_state !== decision.state) {
      updates.push({ id: row.id, state: decision.state, reason: decision.reason });
    }
  }

  printTally('outreach_emails', tally);
  console.log(`  -> ${updates.length} rows would change state`);

  if (dryRun) return;
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
}

async function classifySponsorContacts(): Promise<void> {
  const rows = await db<
    Array<{
      id: string;
      business_name: string | null;
      email: string | null;
      notes: string | null;
      contact_verification_status: string | null;
      contact_name: string | null;
      website: string | null;
      quarantine_state: string;
      contact_evidence_state: string;
    }>
  >`
    SELECT id, business_name, email, notes, contact_verification_status,
           contact_name, website, quarantine_state, contact_evidence_state
    FROM sponsor_contacts
  `;

  const quarantineTally: Tally = {};
  const evidenceTally: Tally = {};

  for (const row of rows) {
    const decision = classifySponsorContact({
      businessName: row.business_name,
      email: row.email,
      notes: row.notes,
      contactVerificationStatus: row.contact_verification_status,
    });
    bump(quarantineTally, decision.state);

    let evidence = evidenceStateFromLegacyStatus({
      status: row.contact_verification_status,
      hasEmail: Boolean(row.email?.trim()),
      hasContactName: Boolean(row.contact_name?.trim()),
      hasWebsite: Boolean(row.website?.trim()),
    });

    // A generic front-desk inbox is an official general inbox at best, never a
    // targeted partnerships contact. 43 of the 94 stored addresses are info@/hello@.
    if (evidence === 'verified_named_decision_maker' || evidence === 'verified_role_inbox') {
      const parts = row.email ? splitEmail(row.email) : null;
      if (parts) {
        const byLocalPart = officialInboxStateForLocalPart(parts.local);
        if (byLocalPart === 'official_general_inbox' && !row.contact_name?.trim()) {
          evidence = 'official_general_inbox';
        }
      }
    }
    // A synthetic fixture is not evidence of anything, whatever the legacy status said.
    if (decision.state === 'quarantined_synthetic') evidence = 'inferred_unverified';

    bump(evidenceTally, evidence);

    if (dryRun) continue;
    const nextQuarantine =
      row.quarantine_state === 'quarantined_by_operator' ? row.quarantine_state : decision.state;
    await db`
      UPDATE sponsor_contacts
      SET quarantine_state = ${nextQuarantine},
          quarantine_reason = ${nextQuarantine === 'active' ? null : decision.reason},
          quarantined_at = ${nextQuarantine === 'active' ? null : db`now()`},
          contact_evidence_state = ${evidence},
          updated_at = now()
      WHERE id = ${row.id}
    `;
  }

  printTally('sponsor_contacts quarantine', quarantineTally);
  printTally('sponsor_contacts contact_evidence_state', evidenceTally);
}

async function classifyCreatorPartnerships(): Promise<void> {
  const rows = await db<
    Array<{
      id: string;
      brand_name: string | null;
      pipeline_status: string | null;
      fit_score: number | null;
      research_status: string | null;
      updated_at: Date;
      quarantine_state: string;
    }>
  >`
    SELECT id, brand_name, pipeline_status::text AS pipeline_status, fit_score,
           research_status, updated_at, quarantine_state
    FROM creator_partnerships
  `;

  const tally: Tally = {};
  for (const row of rows) {
    const decision = classifyCreatorPartnership({
      brandName: row.brand_name,
      pipelineStatus: row.pipeline_status,
      fitScore: row.fit_score,
      researchStatus: row.research_status,
      updatedAt: row.updated_at,
    });
    bump(tally, decision.state);
    if (dryRun) continue;
    if (row.quarantine_state === 'quarantined_by_operator') continue;
    await db`
      UPDATE creator_partnerships
      SET quarantine_state = ${decision.state},
          quarantine_reason = ${decision.reason},
          quarantined_at = ${decision.state === 'active' ? null : db`now()`},
          updated_at = now()
      WHERE id = ${row.id}
    `;
  }
  printTally('creator_partnerships', tally);
}

try {
  console.log(
    dryRun
      ? 'Classifying partnership backlog (DRY RUN — no writes)'
      : 'Classifying partnership backlog',
  );
  await classifyOutreachEmails();
  await classifySponsorContacts();
  await classifyCreatorPartnerships();
  console.log(dryRun ? '\nDry run complete. No rows written.' : '\nClassification complete.');
} finally {
  await db.end();
}
