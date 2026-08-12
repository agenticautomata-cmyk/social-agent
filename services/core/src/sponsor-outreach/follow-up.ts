import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, sponsorContacts } from '../schema.js';
import { env } from '../env.js';
import { getOutreachEmail, createBensonOutreachDraft } from './outreach.js';
import { getEmailTemplateByType } from './templates.js';
import { getSponsorContact } from './contacts.js';
import { buildOutreachSystemPrompt, sanitizeOutreachDraft } from './benson-drafting/voice.js';
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

  // A reply is a qualified pipeline moment — /pipeline must reflect it without a
  // separate manual step (P7E: no duplicate deals for the same business).
  const contact = await getSponsorContact(input.sponsorContactId);
  if (contact) {
    const { ensurePipelineDealOnReply } = await import('../sponsor-pipeline/opportunities.js');
    await ensurePipelineDealOnReply(input.sponsorContactId, contact.businessName);
  }
}

export async function writeFollowUpWithLlm(input: {
  businessName: string;
  contactName: string | null;
  originalSubject: string;
  originalBody: string;
  daysSinceSend?: number;
}): Promise<{ subject: string; body: string }> {
  const fallbackSubject = `Following up — ${input.businessName}`;
  const fallbackBody = `Just circling back on my note about ${input.businessName} — still interested if partnerships are on your radar.\n\n— Kellie`;

  if (!env.OPENAI_API_KEY?.trim()) {
    return { subject: fallbackSubject, body: fallbackBody };
  }

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.5,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildOutreachSystemPrompt({ kind: 'follow_up' }) },
      {
        role: 'user',
        content: JSON.stringify({
          businessName: input.businessName,
          contactName: input.contactName,
          originalSubject: input.originalSubject,
          originalBody: input.originalBody.slice(0, 600),
          daysSinceSend: input.daysSinceSend ?? outreachFollowUpDays(),
        }),
      },
    ],
  });
  const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as {
    subject?: string;
    body?: string;
  };
  return sanitizeOutreachDraft({
    subject: parsed.subject?.trim() || fallbackSubject,
    body: parsed.body?.trim() || fallbackBody,
  });
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
    `Just circling back on my note about ${contact.businessName} — still interested if partnerships are on your radar.\n\n— Kellie`;

  if (env.OPENAI_API_KEY?.trim()) {
    try {
      const regenerated = await writeFollowUpWithLlm({
        businessName: contact.businessName,
        contactName: contact.contactName,
        originalSubject: original.subject,
        originalBody: original.body,
      });
      subject = regenerated.subject;
      body = regenerated.body;
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
    subject: emailRow.subject,
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
