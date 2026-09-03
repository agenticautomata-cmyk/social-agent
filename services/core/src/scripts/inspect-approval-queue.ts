/**
 * Prints the approval queue exactly as Kellie's review screen should show it.
 *
 * The point is to read what she will read: recipient, contact confidence, compensation,
 * the full body, and any remaining warnings — before anything is approved.
 */
import { sql } from 'drizzle-orm';

import { db } from '../db.js';
import {
  contactEvidenceLabel,
  normalizeContactEvidenceState,
} from '../partnership-contracts/contact-evidence.js';

const rows = (await db.execute(sql`
  SELECT e.id, e.subject, e.body, e.status, e.pitch_readiness_status,
         e.compensation_state, e.drafted_by, e.created_at,
         c.business_name, c.email, c.contact_evidence_state, c.contact_role,
         c.evidence_url, c.evidence_captured_at,
         m.name AS media_kit_name, m.kit_kind, m.web_slug, m.is_test_artifact,
         o.qualification_score, o.compensation_note, o.lifecycle_state, o.unknowns
  FROM outreach_emails e
  LEFT JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
  LEFT JOIN media_kits m ON m.id = e.media_kit_id
  LEFT JOIN partnership_opportunities o ON o.id = e.partnership_opportunity_id
  WHERE e.quarantine_state = 'active'
    AND e.status = 'needs_approval'
  ORDER BY e.created_at DESC
`)) as unknown as Array<Record<string, unknown>>;

const list = Array.isArray(rows) ? rows : ((rows as { rows: unknown[] }).rows as never[]) ?? [];

console.log(`Approval queue: ${list.length} pitch(es) awaiting Kellie\n`);

for (const row of list as Array<Record<string, unknown>>) {
  const state = normalizeContactEvidenceState(row.contact_evidence_state);
  console.log('='.repeat(74));
  console.log(`${row.business_name}`);
  console.log(`  to:            ${row.email ?? '(no recipient)'}`);
  console.log(
    `  contact:       ${contactEvidenceLabel(state)}${row.contact_role ? ` — published as "${row.contact_role}"` : ''}`,
  );
  if (row.evidence_url) console.log(`  evidence:      ${row.evidence_url}`);
  console.log(`  compensation:  ${row.compensation_note ?? row.compensation_state}`);
  console.log(`  media kit:     ${row.media_kit_name ?? 'NONE'} (${row.kit_kind ?? 'n/a'})${row.is_test_artifact ? '  ** TEST ARTIFACT **' : ''}`);
  console.log(`  qualification: ${row.qualification_score ?? 'n/a'}`);
  console.log(`  readiness:     ${row.pitch_readiness_status}`);
  console.log(`  drafted by:    ${row.drafted_by}`);
  const unknowns = Array.isArray(row.unknowns) ? (row.unknowns as string[]) : [];
  if (unknowns.length > 0) {
    console.log('  still unknown:');
    for (const item of unknowns) console.log(`    - ${item}`);
  }
  console.log('');
  console.log(`  SUBJECT: ${row.subject}`);
  console.log('');
  for (const line of String(row.body ?? '').split('\n')) console.log(`  ${line}`);
  console.log('');
}
