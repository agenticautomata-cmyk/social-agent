import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, outreachSendAttempts, sponsorContacts } from '../schema.js';
import type { OutreachEmailStatus } from './constants.js';
import { getSponsorContact, loadInventoryItemById } from './contacts.js';
import { getMediaKit } from './media-kits.js';
import { getEmailTemplate } from './templates.js';
import { buildMergeContext, renderTemplate } from './merge.js';
import { contactConfidenceForStatus, type ContactConfidence } from './contact-confidence.js';

export type OutreachEmailRecord = {
  id: string;
  sponsorContactId: string;
  mediaKitId: string | null;
  templateId: string | null;
  subject: string;
  body: string;
  scheduledSendAt: string | null;
  followUpDueAt: string | null;
  status: OutreachEmailStatus;
  approvalRequired: boolean;
  approvedAt: string | null;
  previewedAt: string | null;
  sentAt: string | null;
  failureReason: string | null;
  draftedBy: 'benson' | 'kellie' | 'template' | null;
  bensonDraftContext: Record<string, unknown> | null;
  approvalNotifiedAt: string | null;
  gmailThreadId: string | null;
  sendProvider: string | null;
  pitchReadinessStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type OutreachSendAttemptRecord = {
  id: string;
  outreachEmailId: string;
  attemptedAt: string;
  status: 'simulated' | 'sent' | 'failed' | 'canceled';
  provider: string;
  providerMessageId: string | null;
  recipient: string | null;
  subject: string | null;
  errorMessage: string | null;
};

export type OutreachEmailWithMeta = OutreachEmailRecord & {
  sponsorBusinessName: string;
  sponsorEmail: string | null;
  sponsorContactName: string | null;
  hasContactEmail: boolean;
  /** Truthful confidence tier for the contact path — see contact-confidence.ts. Only 'usable' tiers should render a "has contact" style badge. */
  contactConfidence: ContactConfidence;
  /** True when the underlying sponsor_contacts row has been merged into a canonical duplicate — see canonicalize.ts. */
  isDuplicateContact: boolean;
  mediaKitName: string | null;
  templateName: string | null;
  sendAttempts: OutreachSendAttemptRecord[];
};

export function rowToRecord(row: typeof outreachEmails.$inferSelect): OutreachEmailRecord {
  return {
    id: row.id,
    sponsorContactId: row.sponsorContactId,
    mediaKitId: row.mediaKitId,
    templateId: row.templateId,
    subject: row.subject,
    body: row.body,
    scheduledSendAt: row.scheduledSendAt?.toISOString() ?? null,
    followUpDueAt: row.followUpDueAt?.toISOString() ?? null,
    status: row.status,
    approvalRequired: row.approvalRequired,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    previewedAt: row.previewedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    draftedBy: (row.draftedBy as OutreachEmailRecord['draftedBy']) ?? null,
    bensonDraftContext: (row.bensonDraftContext as Record<string, unknown> | null) ?? null,
    approvalNotifiedAt: row.approvalNotifiedAt?.toISOString() ?? null,
    gmailThreadId: row.gmailThreadId ?? null,
    sendProvider: row.sendProvider ?? null,
    pitchReadinessStatus: row.pitchReadinessStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function attemptToRecord(
  row: typeof outreachSendAttempts.$inferSelect,
): OutreachSendAttemptRecord {
  return {
    id: row.id,
    outreachEmailId: row.outreachEmailId,
    attemptedAt: row.attemptedAt.toISOString(),
    status: row.status,
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    recipient: row.recipient,
    subject: row.subject,
    errorMessage: row.errorMessage,
  };
}

const QUEUE_STATUSES: OutreachEmailStatus[] = [
  'draft',
  'needs_approval',
  'scheduled',
  'sending',
];

const HISTORY_STATUSES: OutreachEmailStatus[] = [
  'simulated_sent',
  'sent',
  'failed',
  'canceled',
];

export async function listOutreachEmails(
  view: 'queue' | 'scheduled' | 'history' | 'all' = 'all',
): Promise<OutreachEmailRecord[]> {
  const statuses =
    view === 'queue' || view === 'scheduled'
      ? QUEUE_STATUSES
      : view === 'history'
        ? HISTORY_STATUSES
        : undefined;

  const rows = statuses
    ? await db
        .select()
        .from(outreachEmails)
        .where(inArray(outreachEmails.status, statuses))
        .orderBy(desc(outreachEmails.updatedAt))
    : await db.select().from(outreachEmails).orderBy(desc(outreachEmails.updatedAt));

  return rows.map(rowToRecord);
}

export async function getOutreachEmail(id: string): Promise<OutreachEmailRecord | null> {
  const rows = await db.select().from(outreachEmails).where(eq(outreachEmails.id, id)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function listSendAttempts(outreachEmailId: string): Promise<OutreachSendAttemptRecord[]> {
  const rows = await db
    .select()
    .from(outreachSendAttempts)
    .where(eq(outreachSendAttempts.outreachEmailId, outreachEmailId))
    .orderBy(desc(outreachSendAttempts.attemptedAt));
  return rows.map(attemptToRecord);
}

export async function createOutreachDraft(input: {
  sponsorContactId: string;
  mediaKitId?: string | null;
  templateId?: string | null;
  subject?: string;
  body?: string;
}): Promise<OutreachEmailRecord> {
  const contact = await getSponsorContact(input.sponsorContactId);
  if (!contact) throw new Error('Sponsor contact not found');

  let subject = input.subject ?? '';
  let body = input.body ?? '';

  if (input.templateId && !input.subject && !input.body) {
    const rendered = await renderOutreachFromTemplate({
      sponsorContactId: input.sponsorContactId,
      mediaKitId: input.mediaKitId ?? null,
      templateId: input.templateId,
    });
    subject = rendered.subject;
    body = rendered.body;
  }

  const [row] = await db
    .insert(outreachEmails)
    .values({
      sponsorContactId: input.sponsorContactId,
      mediaKitId: input.mediaKitId ?? null,
      templateId: input.templateId ?? null,
      subject,
      body,
      status: 'draft',
      approvalRequired: true,
    })
    .returning();

  return rowToRecord(row!);
}

export async function renderOutreachFromTemplate(input: {
  sponsorContactId: string;
  mediaKitId?: string | null;
  templateId: string;
  customSubject?: string;
  customBody?: string;
}): Promise<{ subject: string; body: string }> {
  const contact = await getSponsorContact(input.sponsorContactId);
  if (!contact) throw new Error('Sponsor contact not found');

  const template = await getEmailTemplate(input.templateId);
  if (!template) throw new Error('Template not found');

  const kit = input.mediaKitId ? await getMediaKit(input.mediaKitId) : null;
  const opportunity = contact.sourceOpportunityId
    ? await loadInventoryItemById(contact.sourceOpportunityId)
    : null;

  const context = buildMergeContext({
    businessName: contact.businessName,
    contactName: contact.contactName,
    category: contact.category,
    bensonRecommendation: contact.notes,
    mediaKitName: kit?.name,
    mediaKitUrl: kit?.fileUrl,
    opportunity,
  });

  const rendered = renderTemplate(template, context);
  const { sanitizeOutreachDraft } = await import('./benson-drafting/voice.js');
  const cleaned = sanitizeOutreachDraft({
    subject: input.customSubject ?? rendered.subject,
    body: input.customBody ?? rendered.body,
  });

  return cleaned;
}

export async function previewOutreachEmail(id: string): Promise<OutreachEmailRecord> {
  const email = await getOutreachEmail(id);
  if (!email) throw new Error('Outreach email not found');

  const now = new Date();
  const [row] = await db
    .update(outreachEmails)
    .set({ previewedAt: now, updatedAt: now })
    .where(eq(outreachEmails.id, id))
    .returning();

  return rowToRecord(row!);
}

export async function updateOutreachDraft(
  id: string,
  input: {
    subject?: string;
    body?: string;
    mediaKitId?: string | null;
    templateId?: string | null;
    sponsorContactId?: string;
  },
): Promise<OutreachEmailRecord> {
  const existing = await getOutreachEmail(id);
  if (!existing) throw new Error('Outreach email not found');
  if (existing.status !== 'draft') {
    throw new Error('Only draft emails can be edited');
  }

  const patch: Partial<typeof outreachEmails.$inferInsert> = {
    updatedAt: new Date(),
    previewedAt: null,
  };

  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.body !== undefined) patch.body = input.body;
  if (input.mediaKitId !== undefined) patch.mediaKitId = input.mediaKitId;
  if (input.templateId !== undefined) patch.templateId = input.templateId;
  if (input.sponsorContactId !== undefined) patch.sponsorContactId = input.sponsorContactId;

  const [row] = await db
    .update(outreachEmails)
    .set(patch)
    .where(eq(outreachEmails.id, id))
    .returning();

  return rowToRecord(row!);
}

export async function setOutreachFollowUpDue(
  id: string,
  followUpDueAt: string | null,
): Promise<OutreachEmailRecord> {
  const existing = await getOutreachEmail(id);
  if (!existing) throw new Error('Outreach email not found');

  const [row] = await db
    .update(outreachEmails)
    .set({
      followUpDueAt: followUpDueAt ? new Date(followUpDueAt) : null,
      updatedAt: new Date(),
    })
    .where(eq(outreachEmails.id, id))
    .returning();

  return rowToRecord(row!);
}

export async function scheduleOutreachEmail(
  id: string,
  scheduledSendAt: string,
): Promise<OutreachEmailRecord> {
  const existing = await getOutreachEmail(id);
  if (!existing) throw new Error('Outreach email not found');
  if (!existing.previewedAt) {
    throw new Error('Email must be previewed before scheduling');
  }
  if (!existing.subject.trim() || !existing.body.trim()) {
    throw new Error('Subject and body are required');
  }
  if (!['draft', 'needs_approval'].includes(existing.status)) {
    throw new Error('Only draft emails can be scheduled');
  }

  const now = new Date();
  const [row] = await db
    .update(outreachEmails)
    .set({
      scheduledSendAt: new Date(scheduledSendAt),
      status: existing.approvalRequired ? 'needs_approval' : 'scheduled',
      updatedAt: now,
    })
    .where(eq(outreachEmails.id, id))
    .returning();

  await db
    .update(sponsorContacts)
    .set({ status: 'scheduled', updatedAt: now })
    .where(eq(sponsorContacts.id, existing.sponsorContactId));

  return rowToRecord(row!);
}

export async function approveOutreachEmail(id: string): Promise<OutreachEmailRecord> {
  const existing = await getOutreachEmail(id);
  if (!existing) throw new Error('Outreach email not found');
  if (existing.status !== 'needs_approval') {
    throw new Error('Email is not awaiting approval');
  }

  const now = new Date();
  const [row] = await db
    .update(outreachEmails)
    .set({
      approvedAt: now,
      status: 'scheduled',
      updatedAt: now,
    })
    .where(eq(outreachEmails.id, id))
    .returning();

  return rowToRecord(row!);
}

export async function cancelOutreachEmail(id: string): Promise<OutreachEmailRecord> {
  const existing = await getOutreachEmail(id);
  if (!existing) throw new Error('Outreach email not found');
  if (!['draft', 'needs_approval', 'scheduled'].includes(existing.status)) {
    throw new Error('Email cannot be canceled in current status');
  }

  const now = new Date();
  const [row] = await db
    .update(outreachEmails)
    .set({ status: 'canceled', updatedAt: now })
    .where(eq(outreachEmails.id, id))
    .returning();

  await db.insert(outreachSendAttempts).values({
    outreachEmailId: id,
    status: 'canceled',
    provider: 'demo',
    subject: existing.subject,
    errorMessage: 'Canceled by user',
  });

  return rowToRecord(row!);
}

/** @deprecated Prefer sendOutreachEmail — kept for explicit simulate API calls */
export async function simulateSendOutreachEmail(
  id: string,
): Promise<{ email: OutreachEmailRecord; attempt: OutreachSendAttemptRecord }> {
  const { sendOutreachEmail } = await import('./send.js');
  const result = await sendOutreachEmail(id, { forceMode: 'simulate' });
  return { email: result.email, attempt: result.attempt };
}


export async function createBensonOutreachDraft(input: {
  sponsorContactId: string;
  mediaKitId?: string | null;
  subject: string;
  body: string;
  pitchReadinessStatus?: string;
  bensonDraftContext?: Record<string, unknown>;
}): Promise<OutreachEmailRecord> {
  const contact = await getSponsorContact(input.sponsorContactId);
  if (!contact) throw new Error('Sponsor contact not found');

  const now = new Date();
  const [row] = await db
    .insert(outreachEmails)
    .values({
      sponsorContactId: input.sponsorContactId,
      mediaKitId: input.mediaKitId ?? null,
      templateId: null,
      subject: input.subject,
      body: input.body,
      status: 'needs_approval',
      approvalRequired: true,
      previewedAt: now,
      draftedBy: 'benson',
      pitchReadinessStatus: input.pitchReadinessStatus ?? 'researching',
      bensonDraftContext: input.bensonDraftContext ?? {},
    })
    .returning();

  await db
    .update(sponsorContacts)
    .set({ status: 'ready_to_contact', updatedAt: now })
    .where(eq(sponsorContacts.id, input.sponsorContactId));

  return rowToRecord(row!);
}

export async function markOutreachApprovalNotified(id: string): Promise<void> {
  await db
    .update(outreachEmails)
    .set({ approvalNotifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(outreachEmails.id, id));
}

export async function listOutreachAwaitingApproval(): Promise<OutreachEmailRecord[]> {
  // Only surface drafts belonging to the canonical (non-duplicate) contact for a business —
  // see canonicalize.ts. A business with 14 duplicate contact rows should show at most one
  // active pitch, not 14 near-identical "needs approval" cards.
  const rows = await db
    .select({ email: outreachEmails })
    .from(outreachEmails)
    .innerJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
    .where(and(eq(outreachEmails.status, 'needs_approval'), isNull(sponsorContacts.mergedIntoId)))
    .orderBy(desc(outreachEmails.updatedAt));
  return rows.map((r) => rowToRecord(r.email));
}

export async function updateOutreachApprovalDraft(
  id: string,
  input: { subject?: string; body?: string; mediaKitId?: string | null },
): Promise<OutreachEmailRecord> {
  const existing = await getOutreachEmail(id);
  if (!existing) throw new Error('Outreach email not found');
  if (existing.status !== 'needs_approval') {
    throw new Error('Only emails awaiting approval can be edited here');
  }

  const patch: Partial<typeof outreachEmails.$inferInsert> = { updatedAt: new Date() };
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.body !== undefined) patch.body = input.body;
  if (input.mediaKitId !== undefined) patch.mediaKitId = input.mediaKitId;

  const [row] = await db.update(outreachEmails).set(patch).where(eq(outreachEmails.id, id)).returning();
  return rowToRecord(row!);
}

export async function approveAndScheduleOutreach(
  id: string,
  scheduledSendAt?: string,
): Promise<OutreachEmailRecord> {
  const approved = await approveOutreachEmail(id);
  if (scheduledSendAt) {
    const when = new Date(scheduledSendAt);
    const [row] = await db
      .update(outreachEmails)
      .set({ scheduledSendAt: when, updatedAt: new Date() })
      .where(eq(outreachEmails.id, id))
      .returning();
    return rowToRecord(row!);
  }
  const now = new Date();
  const [row] = await db
    .update(outreachEmails)
    .set({ scheduledSendAt: now, updatedAt: now })
    .where(eq(outreachEmails.id, id))
    .returning();
  return rowToRecord(row!);
}

export type OutreachSendProvenance = 'real' | 'simulated' | 'unknown';

/**
 * A follow-up may only be treated as urgent when it traces back to an actual
 * contact action. This looks at each contact's most recent terminal-status
 * outreach email (sent or simulated_sent) and classifies it — used to prevent
 * simulated/test pitches from ever surfacing as CRITICAL follow-ups.
 */
export async function getSendProvenanceByContact(
  contactIds: string[],
): Promise<Map<string, OutreachSendProvenance>> {
  const result = new Map<string, OutreachSendProvenance>();
  if (contactIds.length === 0) return result;

  const rows = await db
    .select({
      sponsorContactId: outreachEmails.sponsorContactId,
      status: outreachEmails.status,
      sentAt: outreachEmails.sentAt,
      sendProvider: outreachEmails.sendProvider,
    })
    .from(outreachEmails)
    .where(inArray(outreachEmails.sponsorContactId, contactIds))
    .orderBy(desc(outreachEmails.sentAt));

  for (const row of rows) {
    if (result.has(row.sponsorContactId)) continue;
    if (row.status === 'sent') {
      result.set(row.sponsorContactId, 'real');
    } else if (row.status === 'simulated_sent') {
      result.set(row.sponsorContactId, 'simulated');
    }
  }

  for (const id of contactIds) {
    if (!result.has(id)) result.set(id, 'unknown');
  }
  return result;
}

/** All outreach emails across every contact row in a business's duplicate group, newest first. */
export async function listOutreachEmailsForContactIds(
  contactIds: string[],
): Promise<OutreachEmailRecord[]> {
  if (contactIds.length === 0) return [];
  const rows = await db
    .select()
    .from(outreachEmails)
    .where(inArray(outreachEmails.sponsorContactId, contactIds))
    .orderBy(desc(outreachEmails.createdAt));
  return rows.map(rowToRecord);
}

export async function enrichOutreachEmails(
  emails: OutreachEmailRecord[],
): Promise<OutreachEmailWithMeta[]> {
  if (emails.length === 0) return [];

  const { sponsorContacts, mediaKits, emailTemplates } = await import('../schema.js');

  const contactIds = [...new Set(emails.map((e) => e.sponsorContactId))];
  const kitIds = [...new Set(emails.map((e) => e.mediaKitId).filter(Boolean))] as string[];
  const templateIds = [...new Set(emails.map((e) => e.templateId).filter(Boolean))] as string[];

  const contacts = contactIds.length
    ? await db.select().from(sponsorContacts).where(inArray(sponsorContacts.id, contactIds))
    : [];
  const kits =
    kitIds.length > 0
      ? await db.select().from(mediaKits).where(inArray(mediaKits.id, kitIds))
      : [];
  const templates =
    templateIds.length > 0
      ? await db.select().from(emailTemplates).where(inArray(emailTemplates.id, templateIds))
      : [];

  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const kitMap = new Map(kits.map((k) => [k.id, k]));
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  const enriched: OutreachEmailWithMeta[] = [];
  for (const email of emails) {
    const contact = contactMap.get(email.sponsorContactId);
    const kit = email.mediaKitId ? kitMap.get(email.mediaKitId) : null;
    const template = email.templateId ? templateMap.get(email.templateId) : null;
    const attempts = await listSendAttempts(email.id);
    enriched.push({
      ...email,
      sponsorBusinessName: contact?.businessName ?? 'Unknown',
      sponsorEmail: contact?.email ?? null,
      sponsorContactName: contact?.contactName ?? null,
      hasContactEmail: Boolean(contact?.email?.trim()),
      contactConfidence: contactConfidenceForStatus(contact?.contactVerificationStatus),
      isDuplicateContact: Boolean(contact?.mergedIntoId),
      mediaKitName: kit?.name ?? null,
      templateName: template?.name ?? null,
      sendAttempts: attempts,
    });
  }

  return enriched;
}
