/**
 * Read-only integrity report over the partnership tables.
 *
 * Every check here is a question Kellie's workflow depends on the answer to: is the
 * queue she sees actually clean, do the readiness values the surfaces query exist, are
 * sent emails still bound to what was approved, and are replies attached to anything.
 * Run it before and after a deploy. It writes nothing.
 */
import { sql } from 'drizzle-orm';

import { db } from '../db.js';

type Check = {
  title: string;
  sql: string;
  /** What a healthy answer looks like, for the operator reading the output. */
  expectation: string;
};

const CHECKS: Check[] = [
  {
    title: 'Outreach queue by quarantine state',
    expectation: 'active should be a small number; the bulk should be quarantined',
    sql: `SELECT quarantine_state, count(*) AS emails
          FROM outreach_emails GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    title: 'Active approval queue by status',
    expectation: 'only genuinely reviewable pitches',
    sql: `SELECT status, count(*) AS emails
          FROM outreach_emails WHERE quarantine_state = 'active'
          GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    title: 'Pitch readiness values actually present',
    expectation: `the value studio-pulse queries must appear here or its tile reads 0`,
    sql: `SELECT pitch_readiness_status, count(*) AS emails,
                 count(*) FILTER (WHERE quarantine_state = 'active') AS active
          FROM outreach_emails GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    // The business lives on the contact, not the email, so this join is also how we
    // confirm an email is still bound to the business it was written for.
    title: 'Fixture domains still reachable by the approval queue',
    expectation: 'zero rows — a fixture must never be approvable',
    sql: `SELECT e.id, c.business_name, c.email AS recipient_email, e.status, e.quarantine_state
          FROM outreach_emails e
          LEFT JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
          WHERE e.quarantine_state = 'active'
            AND (c.email ~* '\\.(test|example|invalid|localhost)$'
                 OR c.email ILIKE '%@example.%')`,
  },
  {
    // There is no 'approved' status: approval is recorded by approved_at/approved_by.
    title: 'Approved or sent emails missing a content hash',
    expectation: 'zero for anything approved from now on; older rows predate the hash',
    sql: `SELECT count(*) AS approved_or_sent,
                 count(*) FILTER (WHERE approved_content_hash IS NULL) AS approved_without_hash,
                 count(*) FILTER (WHERE status = 'sent' AND sent_content_hash IS NULL) AS sent_without_hash,
                 count(*) FILTER (WHERE status = 'sent'
                                   AND sent_content_hash IS NOT NULL
                                   AND approved_content_hash IS NOT NULL
                                   AND sent_content_hash <> approved_content_hash) AS sent_differs_from_approved
          FROM outreach_emails
          WHERE approved_at IS NOT NULL OR status IN ('scheduled', 'sent')`,
  },
  {
    title: 'Sent emails missing a provider message id',
    expectation: 'real sends should be traceable in the provider',
    sql: `SELECT status, send_provider, count(*) AS emails,
                 count(*) FILTER (WHERE provider_message_id IS NULL) AS without_provider_id
          FROM outreach_emails
          WHERE status IN ('sent', 'simulated_sent')
          GROUP BY 1, 2 ORDER BY 3 DESC`,
  },
  {
    title: 'Inbound replies not bound to an outreach email',
    expectation: 'the known gap: 14 of 14 unattributed before this pass',
    sql: `SELECT count(*) AS inbound_total,
                 count(*) FILTER (WHERE outreach_email_id IS NULL) AS unattributed,
                 count(*) FILTER (WHERE outreach_email_id IS NOT NULL) AS bound
          FROM outreach_inbound_messages`,
  },
  {
    title: 'Contacts by evidence state',
    expectation: 'inferred_unverified and unknown must never be send-ready',
    sql: `SELECT contact_evidence_state, count(*) AS contacts,
                 count(*) FILTER (WHERE email IS NOT NULL) AS with_email
          FROM sponsor_contacts GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    // An official state needs an ownership anchor: either a recorded official page, or
    // a mail domain built from the business's own name. This flags anything asserting
    // official status with neither — the wrong-business bindings live here.
    title: 'Contacts claiming an official state with no ownership anchor',
    expectation: 'zero rows — otherwise a pitch could reach an unrelated company',
    sql: `WITH claimed AS (
            SELECT id, business_name, email, contact_evidence_state, evidence_url,
                   split_part(email, '@', 2) AS email_domain,
                   regexp_split_to_array(
                     lower(regexp_replace(coalesce(business_name, ''), '[^a-zA-Z0-9]+', ' ', 'g')),
                     ' ') AS name_words
            FROM sponsor_contacts
            WHERE contact_evidence_state IN
                  ('verified_named_decision_maker', 'verified_role_inbox', 'official_general_inbox')
          )
          SELECT id, business_name, email, contact_evidence_state
          FROM claimed
          WHERE (evidence_url IS NULL OR evidence_url = '')
            AND NOT EXISTS (
              SELECT 1 FROM unnest(name_words) AS w
              WHERE length(w) > 3
                AND w NOT IN ('hotel','hotels','kansas','city','the','and','company','group')
                AND replace(email_domain, '-', '') LIKE '%' || w || '%'
            )
          LIMIT 20`,
  },
  {
    title: 'Blocklisted addresses reachable as a recipient',
    expectation: 'zero rows — breakingnews@hilton.com is a crisis-communications inbox',
    sql: `SELECT e.id, c.business_name, c.email, e.status
          FROM outreach_emails e
          JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
          JOIN partnership_contact_blocklist b ON lower(b.email) = lower(c.email)
          WHERE e.quarantine_state = 'active'`,
  },
  {
    title: 'Contact blocklist contents',
    expectation: 'the crisis inbox must be listed',
    sql: `SELECT email, reason, scope FROM partnership_contact_blocklist ORDER BY email`,
  },
  {
    title: 'Source registry health',
    expectation: 'unchecked is honest for a new row; healthy requires a real read',
    sql: `SELECT health_state, count(*) AS sources
          FROM partnership_sources GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    title: 'Facts extracted per source',
    expectation: 'every fact must carry the URL it came from',
    sql: `SELECT s.source_key, count(f.id) AS facts,
                 count(f.id) FILTER (WHERE f.source_url IS NULL OR f.source_url = '') AS without_url
          FROM partnership_sources s
          LEFT JOIN partnership_source_facts f ON f.source_key = s.source_key
          GROUP BY 1 HAVING count(f.id) > 0 ORDER BY 2 DESC`,
  },
  {
    title: 'Media kits',
    expectation: 'the 69-byte test PNG must be flagged as a test artifact, not attached',
    sql: `SELECT id, name, kit_kind, business_variant, web_slug, original_filename,
                 file_size, is_test_artifact
          FROM media_kits ORDER BY created_at DESC LIMIT 10`,
  },
  {
    title: 'Emails still attaching a test-artifact media kit',
    expectation: 'zero active rows — 60 queued pitches carried the 69-byte PNG',
    sql: `SELECT e.quarantine_state, count(*) AS emails
          FROM outreach_emails e
          JOIN media_kits m ON m.id = e.media_kit_id
          WHERE m.is_test_artifact = true
          GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    title: 'Stuck worker runs',
    expectation: 'the 60 opportunity-refresh runs stuck since 2026-07-25',
    sql: `SELECT worker_id, status, count(*) AS runs, min(started_at) AS oldest
          FROM worker_job_runs WHERE status = 'running'
          GROUP BY 1, 2 ORDER BY 3 DESC`,
  },
  {
    title: 'Worker visibility',
    expectation: 'the drafting and follow-up workers had zero rows all-time',
    sql: `SELECT worker_id, count(*) AS runs, max(started_at) AS latest
          FROM worker_job_runs GROUP BY 1 ORDER BY 3 DESC NULLS LAST LIMIT 15`,
  },
  {
    title: 'Opportunities by compensation state',
    expectation: 'every opportunity carries exactly one explicit state',
    sql: `SELECT compensation_state, count(*) AS opportunities
          FROM partnership_opportunities GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    title: 'Opportunities that claim send-readiness',
    expectation: 'each must have a verified contact, a comp state and a real media kit',
    sql: `SELECT o.id, o.business_name, o.send_readiness_state, o.compensation_state,
                 c.contact_evidence_state
          FROM partnership_opportunities o
          LEFT JOIN sponsor_contacts c ON c.id = o.sponsor_contact_id
          WHERE o.send_readiness_state = 'send_ready'
          LIMIT 20`,
  },
];

async function main(): Promise<void> {
  let failures = 0;

  for (const check of CHECKS) {
    console.log(`\n=== ${check.title} ===`);
    console.log(`expect: ${check.expectation}`);
    try {
      const result = await db.execute(sql.raw(check.sql));
      const rows = (Array.isArray(result)
        ? result
        : ((result as unknown as { rows: Record<string, unknown>[] }).rows ?? [])) as Record<
        string,
        unknown
      >[];
      if (rows.length === 0) {
        console.log('  (no rows)');
      } else {
        console.table(rows);
      }
    } catch (error) {
      failures += 1;
      console.log(`  QUERY FAILED: ${(error as Error).message}`);
    }
  }

  console.log(
    `\n${failures === 0 ? 'All checks ran.' : `${failures} check(s) could not run.`}`,
  );
}

void main();
