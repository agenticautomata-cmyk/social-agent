import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails } from '../schema.js';
import { sendOutreachEmail } from './send.js';
import { rowToRecord, type OutreachEmailRecord } from './outreach.js';
import { RecipientBlockedError } from './recipient-safety.js';

export async function listDueScheduledOutreach(now = new Date()): Promise<OutreachEmailRecord[]> {
  const rows = await db
    .select()
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.status, 'scheduled'),
        lte(outreachEmails.scheduledSendAt, now),
      ),
    );

  return rows
    .filter((row) => !row.approvalRequired || row.approvedAt)
    .map(rowToRecord);
}

export async function dispatchDueOutreachEmails(now = new Date()): Promise<{
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
  blocked: number;
  errors: string[];
}> {
  const due = await listDueScheduledOutreach(now);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let blocked = 0;
  const errors: string[] = [];

  for (const email of due) {
    if (email.approvalRequired && !email.approvedAt) {
      skipped += 1;
      continue;
    }
    try {
      const result = await sendOutreachEmail(email.id);
      if (result.email.status === 'failed') {
        failed += 1;
        errors.push(`${email.id}: ${result.email.failureReason ?? 'send failed'}`);
      } else {
        sent += 1;
      }
    } catch (err) {
      // A blocked recipient is not a transient failure — sendOutreachEmail has already
      // moved the row to `failed` with an honest reason, so it will not be retried.
      // Count it separately so the log does not read as an infrastructure error.
      if (err instanceof RecipientBlockedError) {
        blocked += 1;
        errors.push(`${email.id}: blocked — ${err.message}`);
        continue;
      }
      failed += 1;
      errors.push(`${email.id}: ${err instanceof Error ? err.message : 'send failed'}`);
    }
  }

  return { checked: due.length, sent, failed, skipped, blocked, errors };
}
