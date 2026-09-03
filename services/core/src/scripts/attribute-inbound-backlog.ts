/**
 * Re-runs attribution over inbound messages that are not bound to a pitch.
 *
 * The expected result on current data is that nothing changes, and that is the point:
 * all 14 messages are platform and newsletter mail, so staying unbound is correct. The
 * script exists so the claim is checked rather than assumed, and so it can be re-run
 * once real replies start arriving.
 */
import { sql } from 'drizzle-orm';

import { db } from '../db.js';
import { matchReplyToPitch } from '../sponsor-outreach/reply-attribution.js';

const dryRun = !process.argv.includes('--apply');

async function query<T>(text: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(text);
  return (Array.isArray(result)
    ? result
    : ((result as unknown as { rows: T[] }).rows ?? [])) as T[];
}

async function main(): Promise<void> {
  const pitches = await query<{
    id: string;
    to_email: string | null;
    gmail_thread_id: string | null;
    business_name: string | null;
    opportunity_id: string | null;
    opportunity_business_key: string | null;
  }>(sql`
    SELECT e.id,
           c.email AS to_email,
           e.gmail_thread_id,
           coalesce(o.business_name, c.business_name) AS business_name,
           o.id AS opportunity_id,
           o.business_key AS opportunity_business_key
    FROM outreach_emails e
    JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
    LEFT JOIN partnership_opportunities o ON o.outreach_email_id = e.id
    WHERE e.sent_at IS NOT NULL
  `);

  const inbound = await query<{
    id: string;
    from_email: string | null;
    subject: string | null;
    gmail_thread_id: string | null;
  }>(sql`
    SELECT id, from_email, subject, gmail_thread_id
    FROM outreach_inbound_messages
    WHERE outreach_email_id IS NULL
    ORDER BY received_at DESC
  `);

  console.log(
    `${pitches.length} sent pitch(es) to match against, ${inbound.length} unbound inbound message(s).\n`,
  );

  let bound = 0;
  for (const message of inbound) {
    const match = matchReplyToPitch({
      fromEmail: message.from_email,
      subject: message.subject,
      threadId: message.gmail_thread_id,
      pitches,
    });

    if (!match) {
      console.log(`unbound  ${message.from_email} — ${(message.subject ?? '').slice(0, 60)}`);
      continue;
    }

    bound += 1;
    console.log(
      `BOUND    ${message.from_email} -> ${match.businessKey} via ${match.method}\n         ${match.confidenceNote}`,
    );

    if (!dryRun) {
      await db.execute(sql`
        UPDATE outreach_inbound_messages
        SET outreach_email_id = ${match.outreachEmailId},
            partnership_opportunity_id = ${match.partnershipOpportunityId},
            matched_business_key = ${match.businessKey},
            match_method = ${match.method},
            match_confidence_note = ${match.confidenceNote},
            match_kind = 'outreach_reply'
        WHERE id = ${message.id}
      `);
    }
  }

  console.log(
    `\n${bound} of ${inbound.length} message(s) attributed${dryRun ? ' (dry run, nothing written)' : ''}.`,
  );
  if (bound === 0) {
    console.log(
      'Nothing bound. On current data that is the correct answer — no business has replied to a pitch yet.',
    );
  }
}

void main();
