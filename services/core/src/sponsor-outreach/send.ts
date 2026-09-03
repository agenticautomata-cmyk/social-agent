import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, outreachSendAttempts, sponsorContacts } from '../schema.js';
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
import {
  RecipientBlockedError,
  evaluateRecipientSafety,
  looksLikeSyntheticFixture,
} from './recipient-safety.js';
import { matchesApprovedContent, outreachContentHash, legacyApprovalMissingHash } from './content-hash.js';
import { resolveKitVersionForOutreach } from '../media-kit/versions.js';

export { getOutreachSendConfig, type OutreachSendMode } from './email-providers/index.js';

function assertApprovedForSend(email: OutreachEmailRecord): void {
  if (email.status !== 'scheduled') {
    throw new Error('Only approved scheduled emails can be sent');
  }
  if (email.approvalRequired && !email.approvedAt) {
    throw new Error('Email must be approved before sending');
  }
  // A quarantined row is out of Kellie's workflow entirely. Two rows sat in
  // `scheduled` with July approval stamps addressed to an estate-sale listing and a
  // Pokemon-card auction headline; neither is a business.
  if (email.quarantineState && email.quarantineState !== 'active') {
    throw new Error(
      `This pitch is quarantined and cannot be sent. ${email.quarantineReason ?? ''}`.trim(),
    );
  }
}

/** Thrown when the draft changed after Kellie approved it. */
export class ApprovedContentMismatchError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ApprovedContentMismatchError';
  }
}

/** Thrown when identical content has already gone to this contact. */
export class DuplicateSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateSendError';
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

  // Recipient safety is enforced here as well as at approval, because this is the
  // only function that actually hands an address to a mail provider. A synthetic
  // fixture, a reserved-TLD domain, or a wrong-purpose inbox (e.g. Hilton's
  // crisis-communications address) must never reach the provider even if a row
  // somehow arrived at `scheduled` with an approval stamp.
  const safety = evaluateRecipientSafety({
    email: recipient,
    businessName: contact.businessName,
    notes: contact.notes,
  });
  if (mode === 'live' && !safety.sendable) {
    const failedAt = new Date();
    await db
      .update(outreachEmails)
      .set({
        status: 'failed',
        failureReason: `Blocked before send — ${safety.summary}`,
        updatedAt: failedAt,
      })
      .where(eq(outreachEmails.id, id));
    await recordSendAttempt({
      outreachEmailId: id,
      status: 'failed',
      provider: 'blocked',
      recipient,
      subject: existing.subject,
      errorMessage: `Blocked before send — ${safety.summary}`,
    });
    throw new RecipientBlockedError(safety);
  }
  // A simulated send on a synthetic fixture manufactures fake activity on a row that
  // is not a real business. Refuse it rather than record a misleading "sent".
  if (mode === 'simulate' && safety.syntheticFixture) {
    throw new RecipientBlockedError(safety);
  }

  // Send exactly the version Kellie reviewed, to exactly the recipient she reviewed.
  // Legacy hashless approvals cannot bypass the integrity gate — force re-approval.
  if (mode === 'live' && legacyApprovalMissingHash(existing)) {
    const reason =
      'This pitch was approved before content hashing. Re-approve it so the send path can prove it matches what Kellie reviewed, including the media kit version.';
    await db
      .update(outreachEmails)
      .set({
        status: 'needs_approval',
        approvedAt: null,
        approvedContentHash: null,
        approvedRecipient: null,
        approvedMediaKitVersionId: null,
        approvedMediaKitContentHash: null,
        failureReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(outreachEmails.id, id));
    throw new ApprovedContentMismatchError(reason);
  }

  const kitPin = await resolveKitVersionForOutreach(existing.mediaKitId);
  // Prefer the version pinned at approval; fall back to current kit pointer for hash check.
  const mediaKitVersionId =
    existing.approvedMediaKitVersionId ?? kitPin?.versionId ?? null;
  const mediaKitContentHash =
    existing.approvedMediaKitContentHash ?? kitPin?.contentHash ?? null;

  const contentHash = recipient
    ? outreachContentHash({
        subject: existing.subject,
        body: existing.body,
        recipient,
        mediaKitId: existing.mediaKitId,
        mediaKitVersionId,
        mediaKitContentHash,
      })
    : null;

  if (mode === 'live' && existing.approvedContentHash) {
    const match = matchesApprovedContent({
      approvedContentHash: existing.approvedContentHash,
      approvedRecipient: existing.approvedRecipient,
      currentSubject: existing.subject,
      currentBody: existing.body,
      currentRecipient: recipient ?? '',
      mediaKitId: existing.mediaKitId,
      mediaKitVersionId,
      mediaKitContentHash,
    });
    if (!match.matches) {
      const failedAt = new Date();
      await db
        .update(outreachEmails)
        .set({
          status: 'needs_approval',
          approvedAt: null,
          approvedContentHash: null,
          approvedRecipient: null,
          approvedMediaKitVersionId: null,
          approvedMediaKitContentHash: null,
          failureReason: match.reason,
          updatedAt: failedAt,
        })
        .where(eq(outreachEmails.id, id));
      throw new ApprovedContentMismatchError(match.reason ?? 'Approved content no longer matches');
    }
  }

  // The two real Gmail sends in this system's lifetime went to the same contact with
  // the same subject six days apart. Identical content to the same contact is a bug,
  // not an intentional follow-up — a follow-up has different content.
  if (mode === 'live' && contentHash) {
    const [duplicate] = await db
      .select({ id: outreachEmails.id, sentAt: outreachEmails.sentAt })
      .from(outreachEmails)
      .where(
        and(
          eq(outreachEmails.sponsorContactId, existing.sponsorContactId),
          eq(outreachEmails.sentContentHash, contentHash),
          ne(outreachEmails.id, id),
        ),
      )
      .limit(1);
    if (duplicate) {
      const when = duplicate.sentAt ? new Date(duplicate.sentAt).toISOString().slice(0, 10) : 'earlier';
      const reason = `This exact pitch already went to ${contact.businessName} on ${when}. Rewrite it as a follow-up rather than sending the same message twice.`;
      await db
        .update(outreachEmails)
        .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
        .where(eq(outreachEmails.id, id));
      await recordSendAttempt({
        outreachEmailId: id,
        status: 'failed',
        provider: 'duplicate_guard',
        recipient,
        subject: existing.subject,
        errorMessage: reason,
      });
      throw new DuplicateSendError(reason);
    }
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

    // Intentionally do NOT call markContactSent/scheduleOutreachFollowUp here — a
    // simulated send must never advance the real relationship stage or stamp a
    // lastContactedAt/nextFollowUpAt that would later surface as a genuine, actionable
    // "pending follow-up". Only an actual send (live mode / recordManualBusinessContact)
    // may do that. See action-center/collect.ts provenance filtering for the same rule.

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
      // Proof of what actually went out, and the provider id needed to bind a reply
      // back to this pitch. All 14 inbound messages were unattributed because only
      // gmail_thread_id was ever stored.
      sentContentHash: contentHash,
      sentRecipient: recipient,
      providerMessageId: result.providerMessageId ?? null,
      pitchReadinessStatus: 'sent',
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

/**
 * Kellie delivered the pitch outside Benson email send (e.g. business contact form).
 * Closes the draft, marks the contact as contact-form-only, and schedules follow-up.
 */
export async function markOutreachSentViaContactForm(id: string): Promise<{
  email: OutreachEmailRecord;
  attempt: OutreachSendAttemptRecord;
}> {
  const existing = await getOutreachEmail(id);
  if (!existing) throw new Error('Outreach email not found');
  if (!['draft', 'needs_approval', 'scheduled'].includes(existing.status)) {
    throw new Error('Only open drafts can be marked sent via contact form');
  }

  const contact = await getSponsorContact(existing.sponsorContactId);
  if (!contact) throw new Error('Sponsor contact not found');
  if (
    looksLikeSyntheticFixture({
      email: contact.email,
      businessName: contact.businessName,
      notes: contact.notes,
    })
  ) {
    throw new RecipientBlockedError(
      evaluateRecipientSafety({
        email: contact.email,
        businessName: contact.businessName,
        notes: contact.notes,
      }),
    );
  }

  const now = new Date();
  const noteLine = `${now.toISOString().slice(0, 10)}: Kellie sent pitch via online contact form (no email poster).`;
  const nextNotes = contact.notes?.trim()
    ? `${contact.notes.trim()}\n${noteLine}`
    : noteLine;
  const priorContext =
    existing.bensonDraftContext && typeof existing.bensonDraftContext === 'object'
      ? existing.bensonDraftContext
      : {};

  const [emailRow] = await db
    .update(outreachEmails)
    .set({
      status: 'sent',
      approvedAt: existing.approvedAt ? new Date(existing.approvedAt) : now,
      sentAt: now,
      failureReason: null,
      sendProvider: 'manual_contact_form',
      pitchReadinessStatus: 'sent',
      bensonDraftContext: {
        ...priorContext,
        missingContact: true,
        sentVia: 'contact_form',
        contactFormSentAt: now.toISOString(),
        contactFormNote:
          'No usable email — Kellie submitted the approved pitch through the business online contact form.',
      },
      updatedAt: now,
    })
    .where(eq(outreachEmails.id, id))
    .returning();

  const attempt = await recordSendAttempt({
    outreachEmailId: id,
    status: 'sent',
    provider: 'manual_contact_form',
    recipient: contact.website?.trim() || contact.email?.trim() || null,
    subject: existing.subject,
  });

  await db
    .update(sponsorContacts)
    .set({
      contactVerificationStatus: 'contact_form',
      notes: nextNotes,
      updatedAt: now,
    })
    .where(eq(sponsorContacts.id, existing.sponsorContactId));

  await markContactSent(existing.sponsorContactId, now);
  await scheduleOutreachFollowUp({
    outreachEmailId: id,
    sponsorContactId: existing.sponsorContactId,
    sentAt: now,
  });

  return {
    email: rowToRecord(emailRow!),
    attempt,
  };
}

export const MANUAL_CONTACT_CHANNELS = ['email', 'site_form', 'dm', 'phone', 'in_person'] as const;
export type ManualContactChannel = (typeof MANUAL_CONTACT_CHANNELS)[number];

const MANUAL_CHANNEL_LABEL: Record<ManualContactChannel, string> = {
  email: 'Email (sent outside Benson)',
  site_form: 'Website contact form',
  dm: 'Direct message',
  phone: 'Phone call',
  in_person: 'In person',
};

const MANUAL_CHANNEL_VERIFICATION: Record<ManualContactChannel, string> = {
  email: 'verified_direct_email',
  site_form: 'contact_form',
  dm: 'verified_social_dm_path',
  phone: 'phone_only',
  in_person: 'generic_business_contact',
};

/**
 * Records a real, already-completed outreach action that didn't go through Benson's own send
 * pipeline — a business contact form, a DM, a phone call, an in-person visit, or an email
 * Kellie sent from her own inbox. Creates one canonical `outreachEmails` "sent" row so P7D/P7E
 * gets the same provenance (getSendProvenanceByContact), follow-up scheduling, and
 * reply-to-pipeline machinery as a Benson-sent email. Never fabricates a send that didn't
 * actually happen — this only records what the creator explicitly confirms they did.
 */
export async function recordManualBusinessContact(input: {
  sponsorContactId: string;
  channel: ManualContactChannel;
  note?: string | null;
}): Promise<{ email: OutreachEmailRecord; attempt: OutreachSendAttemptRecord }> {
  const contact = await getSponsorContact(input.sponsorContactId);
  if (!contact) throw new Error('Sponsor contact not found');

  const now = new Date();
  const label = MANUAL_CHANNEL_LABEL[input.channel];
  const [emailRow] = await db
    .insert(outreachEmails)
    .values({
      sponsorContactId: input.sponsorContactId,
      subject: `Contacted via ${label}`,
      body: input.note?.trim() || `Kellie contacted ${contact.businessName} via ${label.toLowerCase()}.`,
      status: 'sent',
      approvalRequired: false,
      approvedAt: now,
      sentAt: now,
      sendProvider: `manual_${input.channel}`,
      pitchReadinessStatus: 'sent',
    })
    .returning();

  const attempt = await recordSendAttempt({
    outreachEmailId: emailRow!.id,
    status: 'sent',
    provider: `manual_${input.channel}`,
    recipient: contact.email ?? contact.website ?? contact.instagram ?? null,
    subject: emailRow!.subject,
  });

  const noteLine = `${now.toISOString().slice(0, 10)}: Contacted via ${label}${input.note?.trim() ? ` — ${input.note.trim()}` : ''}.`;
  await db
    .update(sponsorContacts)
    .set({
      contactVerificationStatus: MANUAL_CHANNEL_VERIFICATION[input.channel],
      notes: contact.notes?.trim() ? `${contact.notes.trim()}\n${noteLine}` : noteLine,
      updatedAt: now,
    })
    .where(eq(sponsorContacts.id, input.sponsorContactId));

  await markContactSent(input.sponsorContactId, now);
  await scheduleOutreachFollowUp({
    outreachEmailId: emailRow!.id,
    sponsorContactId: input.sponsorContactId,
    sentAt: now,
  });

  return { email: rowToRecord(emailRow!), attempt };
}
