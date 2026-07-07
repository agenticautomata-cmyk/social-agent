import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, sponsorContacts } from '../schema.js';
import { env } from '../env.js';
import { getOutreachEmail, createBensonOutreachDraft } from './outreach.js';
import { getEmailTemplateByType } from './templates.js';
import { getSponsorContact } from './contacts.js';
import { notifyOutreachDraftReady } from '../outreach-notifications/notify-kellie.js';
import { computeFollowUpDueAt, outreachFollowUpDays } from './follow-up-dates.js';

export { computeFollowUpDueAt, outreachFollowUpDays } from './follow-up-dates.js';

export async function scheduleOutreachFollowUp(input: {
  outreachEmailId: string;
  sponsorContactId: string;
  sentAt: Date;
}): Promise<void> {
  const dueAt = computeFollowUpDueAt(input.sentAt);
  await db
    .update(outreachEmails)
    .set({ followUpDueAt: dueAt, updatedAt: new Date() })
    .where(eq(outreachEmails.id, input.outreachEmailId));

  await db
    .update(sponsorContacts)
    .set({
      status: 'follow_up_needed',
      nextFollowUpAt: dueAt,
      updatedAt: new Date(),
    })
    .where(eq(sponsorContacts.id, input.sponsorContactId));
}

export async function clearOutreachFollowUp(input: {
  outreachEmailId?: string | null;
  sponsorContactId: string;
}): Promise<void> {
  const now = new Date();
  if (input.outreachEmailId) {
    await db
      .update(outreachEmails)
      .set({ followUpDueAt: null, updatedAt: now })
      .where(eq(outreachEmails.id, input.outreachEmailId));
  }

  await db
    .update(sponsorContacts)
    .set({
      status: 'replied',
      nextFollowUpAt: null,
      updatedAt: now,
    })
    .where(eq(sponsorContacts.id, input.sponsorContactId));
}

async function hasFollowUpDraft(sponsorContactId: string): Promise<boolean> {
  const rows = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.sponsorContactId, sponsorContactId),
        inArray(outreachEmails.status, ['draft', 'needs_approval', 'scheduled']),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function draftFollowUpForSentEmail(outreachEmailId: string): Promise<{
  emailId: string;
  skipped?: string;
}> {
  const original = await getOutreachEmail(outreachEmailId);
  if (!original) return { emailId: '', skipped: 'email_not_found' };
  if (original.status !== 'sent' && original.status !== 'simulated_sent') {
    return { emailId: '', skipped: 'not_sent' };
  }

  const contact = await getSponsorContact(original.sponsorContactId);
  if (!contact) return { emailId: '', skipped: 'contact_not_found' };
  if (contact.status === 'replied' || contact.status === 'not_interested') {
    return { emailId: '', skipped: contact.status };
  }
  if (await hasFollowUpDraft(contact.id)) {
    return { emailId: '', skipped: 'existing_draft' };
  }

  const template = await getEmailTemplateByType('follow_up');
  let subject =
    template?.subject?.replace(/\{\{businessName\}\}/g, contact.businessName) ??
    `Following up — ${contact.businessName}`;
  let body =
    template?.body?.replace(/\{\{businessName\}\}/g, contact.businessName) ??
    `Hi — just circling back on my note about a potential partnership with ${contact.businessName}. Would love to connect if there's interest.\n\n— Kellie`;

  if (env.OPENAI_API_KEY?.trim()) {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Write a brief sponsor follow-up email for Kellie (KC creator). Under 120 words. JSON: {"subject":"...","body":"..."}',
          },
          {
            role: 'user',
            content: JSON.stringify({
              businessName: contact.businessName,
              originalSubject: original.subject,
              daysSinceSend: outreachFollowUpDays(),
            }),
          },
        ],
      });
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as {
        subject?: string;
        body?: string;
      };
      if (parsed.subject?.trim()) subject = parsed.subject.trim();
      if (parsed.body?.trim()) body = parsed.body.trim();
    } catch {
      /* template fallback */
    }
  }

  const emailRow = await createBensonOutreachDraft({
    sponsorContactId: contact.id,
    mediaKitId: original.mediaKitId,
    subject,
    body,
    bensonDraftContext: {
      kind: 'follow_up',
      originalOutreachEmailId: outreachEmailId,
      templateType: 'follow_up',
    },
  });

  await notifyOutreachDraftReady({
    emailId: emailRow.id,
    businessName: contact.businessName,
  });

  return { emailId: emailRow.id };
}

export async function processDueOutreachFollowUps(): Promise<{
  processed: number;
  drafted: string[];
  skipped: string[];
}> {
  const now = new Date();
  const dueRows = await db
    .select({
      id: outreachEmails.id,
      sponsorContactId: outreachEmails.sponsorContactId,
    })
    .from(outreachEmails)
    .where(
      and(
        inArray(outreachEmails.status, ['sent', 'simulated_sent']),
        lte(outreachEmails.followUpDueAt, now),
      ),
    )
    .limit(20);

  const drafted: string[] = [];
  const skipped: string[] = [];

  for (const row of dueRows) {
    const contact = await getSponsorContact(row.sponsorContactId);
    if (!contact || contact.status === 'replied' || contact.status === 'not_interested') {
      skipped.push(`${row.id}:contact_${contact?.status ?? 'missing'}`);
      await db
        .update(outreachEmails)
        .set({ followUpDueAt: null, updatedAt: now })
        .where(eq(outreachEmails.id, row.id));
      continue;
    }

    const result = await draftFollowUpForSentEmail(row.id);
    if (result.skipped) {
      skipped.push(`${row.id}:${result.skipped}`);
      if (result.skipped === 'existing_draft' || result.skipped === 'replied') {
        await db
          .update(outreachEmails)
          .set({ followUpDueAt: null, updatedAt: now })
          .where(eq(outreachEmails.id, row.id));
      }
      continue;
    }
    if (result.emailId) {
      drafted.push(result.emailId);
      await db
        .update(outreachEmails)
        .set({ followUpDueAt: null, updatedAt: now })
        .where(eq(outreachEmails.id, row.id));
    }
  }

  return { processed: dueRows.length, drafted, skipped };
}
