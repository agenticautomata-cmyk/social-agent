import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, outreachSendAttempts } from '../schema.js';
import { getSponsorContact, markContactSent } from './contacts.js';
import { scheduleOutreachFollowUp } from './follow-up.js';
import {
  createEmailProvider,
  getOutreachSendConfig,
  type OutreachSendMode,
} from './email-providers/index.js';
import { getMediaKit } from './media-kits.js';
import { readMediaKitFile } from './media-kit-storage.js';
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

async function buildAttachments(mediaKitId: string | null) {
  if (!mediaKitId) return [];
  const kit = await getMediaKit(mediaKitId);
  if (!kit?.storageFilename) return [];
  const file = await readMediaKitFile(kit.storageFilename);
  if (!file) return [];
  return [
    {
      filename: kit.originalFilename ?? kit.name ?? 'media-kit.pdf',
      mimeType: file.mimeType,
      content: file.buffer,
    },
  ];
}

export async function sendOutreachEmail(
  id: string,
  options?: { forceMode?: OutreachSendMode },
): Promise<{
  email: OutreachEmailRecord;
  attempt: OutreachSendAttemptRecord;
  mode: OutreachSendMode;
}> {
  const config = await getOutreachSendConfig();
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
        sendProvider: 'demo',
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
    await scheduleOutreachFollowUp({
      outreachEmailId: id,
      sponsorContactId: existing.sponsorContactId,
      sentAt: now,
    });

    return {
      email: rowToRecord(emailRow!),
      attempt,
      mode: 'simulate',
    };
  }

  const providerId = config.provider ?? 'resend';
  const provider = await createEmailProvider(providerId);
  if (!provider) {
    await db
      .update(outreachEmails)
      .set({
        status: 'failed',
        failureReason: 'Live send is not configured',
        updatedAt: new Date(),
      })
      .where(eq(outreachEmails.id, id));
    throw new Error('Live send is disabled or provider is not configured');
  }

  const attachments = await buildAttachments(existing.mediaKitId);
  const result = await provider.send({
    to: recipient!,
    subject: existing.subject,
    body: existing.body,
    replyTo: config.replyTo,
    fromEmail: config.fromEmail,
    attachments,
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
      gmailThreadId: result.threadId ?? null,
      sendProvider: provider.providerId,
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
  await scheduleOutreachFollowUp({
    outreachEmailId: id,
    sponsorContactId: existing.sponsorContactId,
    sentAt: sentNow,
  });

  return {
    email: rowToRecord(emailRow!),
    attempt,
    mode: 'live',
  };
}
