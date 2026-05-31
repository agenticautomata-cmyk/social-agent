import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, outreachSendAttempts } from '../schema.js';
import { getSponsorContact, markContactSent } from './contacts.js';
import { createEmailProvider, getOutreachSendConfig, type OutreachSendMode } from './email-providers/index.js';
import {
  getOutreachEmail,
  rowToRecord,
  attemptToRecord,
  type OutreachEmailRecord,
  type OutreachSendAttemptRecord,
} from './outreach.js';

export { getOutreachSendConfig, type OutreachSendMode } from './email-providers/index.js';

function assertApprovedForSend(email: OutreachEmailRecord): void {
  if (email.status !== 'scheduled') {
    throw new Error('Only approved scheduled emails can be sent');
  }
  if (email.approvalRequired && !email.approvedAt) {
    throw new Error('Email must be approved before sending');
  }
}

async function recordSendAttempt(input: {
  outreachEmailId: string;
  status: 'simulated' | 'sent' | 'failed';
  provider: string;
  recipient: string | null;
  subject: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}): Promise<OutreachSendAttemptRecord> {
  const [row] = await db
    .insert(outreachSendAttempts)
    .values({
      outreachEmailId: input.outreachEmailId,
      status: input.status,
      provider: input.provider,
      recipient: input.recipient,
      subject: input.subject,
      providerMessageId: input.providerMessageId ?? null,
      errorMessage: input.errorMessage ?? null,
    })
    .returning();
  return attemptToRecord(row!);
}

export async function sendOutreachEmail(
  id: string,
  options?: { forceMode?: OutreachSendMode },
): Promise<{
  email: OutreachEmailRecord;
  attempt: OutreachSendAttemptRecord;
  mode: OutreachSendMode;
}> {
  const config = getOutreachSendConfig();
  const mode = options?.forceMode ?? config.mode;

  const existing = await getOutreachEmail(id);
  if (!existing) throw new Error('Outreach email not found');
  assertApprovedForSend(existing);

  const contact = await getSponsorContact(existing.sponsorContactId);
  if (!contact) throw new Error('Sponsor contact not found');

  const recipient = contact.email?.trim() ?? null;
  if (mode === 'live' && !recipient) {
    throw new Error('Sponsor contact must have an email address for live send');
  }

  const now = new Date();
  await db
    .update(outreachEmails)
    .set({ status: 'sending', updatedAt: now })
    .where(eq(outreachEmails.id, id));

  if (mode === 'simulate') {
    const [emailRow] = await db
      .update(outreachEmails)
      .set({
        status: 'simulated_sent',
        sentAt: now,
        failureReason: null,
        updatedAt: now,
      })
      .where(eq(outreachEmails.id, id))
      .returning();

    const attempt = await recordSendAttempt({
      outreachEmailId: id,
      status: 'simulated',
      provider: 'demo',
      recipient,
      subject: existing.subject,
    });

    await markContactSent(existing.sponsorContactId, now);

    return {
      email: rowToRecord(emailRow!),
      attempt,
      mode: 'simulate',
    };
  }

  const provider = createEmailProvider('resend');
  if (!provider) {
    await db
      .update(outreachEmails)
      .set({
        status: 'failed',
        failureReason: 'Live send is not configured',
        updatedAt: new Date(),
      })
      .where(eq(outreachEmails.id, id));
    throw new Error(
      'Live send is disabled or missing RESEND_API_KEY / OUTREACH_FROM_EMAIL / OUTREACH_ENABLE_LIVE_SEND',
    );
  }

  const result = await provider.send({
    to: recipient!,
    subject: existing.subject,
    body: existing.body,
    replyTo: config.replyTo,
  });

  if (!result.ok) {
    const failNow = new Date();
    const [emailRow] = await db
      .update(outreachEmails)
      .set({
        status: 'failed',
        failureReason: result.error ?? 'Send failed',
        updatedAt: failNow,
      })
      .where(eq(outreachEmails.id, id))
      .returning();

    const attempt = await recordSendAttempt({
      outreachEmailId: id,
      status: 'failed',
      provider: provider.providerId,
      recipient,
      subject: existing.subject,
      errorMessage: result.error ?? 'Send failed',
    });

    return {
      email: rowToRecord(emailRow!),
      attempt,
      mode: 'live',
    };
  }

  const sentNow = new Date();
  const [emailRow] = await db
    .update(outreachEmails)
    .set({
      status: 'sent',
      sentAt: sentNow,
      failureReason: null,
      updatedAt: sentNow,
    })
    .where(eq(outreachEmails.id, id))
    .returning();

  const attempt = await recordSendAttempt({
    outreachEmailId: id,
    status: 'sent',
    provider: provider.providerId,
    recipient,
    subject: existing.subject,
    providerMessageId: result.providerMessageId,
  });

  await markContactSent(existing.sponsorContactId, sentNow);

  return {
    email: rowToRecord(emailRow!),
    attempt,
    mode: 'live',
  };
}
