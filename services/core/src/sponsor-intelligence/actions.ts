import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, sponsorContacts } from '../schema.js';
import {
  createSponsorFromOpportunity,
  loadInventoryItemById,
  updateSponsorContact,
  type SponsorContactRecord,
} from '../sponsor-outreach/contacts.js';
import { getEmailTemplateByType } from '../sponsor-outreach/templates.js';
import { createOutreachDraft } from '../sponsor-outreach/outreach.js';
import { upsertPlannerItem } from '../content-planner/items.js';
import { recordPassedOpportunity } from '../creator-preferences/passed-opportunities.js';
import { pickTemplateType } from './scoring.js';

export async function dismissOpportunity(contentItemId: string): Promise<SponsorContactRecord> {
  const item = await loadInventoryItemById(contentItemId);
  const existing = await db
    .select()
    .from(sponsorContacts)
    .where(eq(sponsorContacts.sourceOpportunityId, contentItemId))
    .limit(1);

  if (existing[0]) {
    const updated = await updateSponsorContact(existing[0].id, { status: 'not_interested' });
    if (item?.title) {
      await recordPassedOpportunity(item.title, 'dashboard', 'Marked not interested').catch(() => {});
    }
    return updated!;
  }

  const { contact } = await createSponsorFromOpportunity(contentItemId);
  const updated = await updateSponsorContact(contact.id, { status: 'not_interested' });
  if (item?.title) {
    await recordPassedOpportunity(item.title, 'dashboard', 'Marked not interested').catch(() => {});
  }
  return updated!;
}

export async function addOpportunityToPlanner(contentItemId: string): Promise<void> {
  await upsertPlannerItem(contentItemId, {
    action: 'save',
    listName: 'Sponsors',
  });
}

export async function createDraftOutreachFromOpportunity(contentItemId: string): Promise<{
  contact: SponsorContactRecord;
  emailId: string;
  templateType: string;
}> {
  const { draftSponsorOutreachFromOpportunity } = await import(
    '../sponsor-outreach/benson-drafting/draft.js'
  );
  const llmResult = await draftSponsorOutreachFromOpportunity(contentItemId);
  const { contact } = await createSponsorFromOpportunity(contentItemId);

  if (llmResult.emailId) {
    return {
      contact,
      emailId: llmResult.emailId,
      templateType: llmResult.skipped === 'existing_draft' ? 'existing_draft' : 'benson_llm',
    };
  }

  if (llmResult.skipped === 'not_interested' || llmResult.skipped === 'recently_contacted') {
    throw new Error(`Cannot draft outreach: ${llmResult.skipped}`);
  }

  const existingDraft = await db
    .select()
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.sponsorContactId, contact.id),
        inArray(outreachEmails.status, ['draft', 'needs_approval']),
      ),
    )
    .orderBy(desc(outreachEmails.updatedAt))
    .limit(1);

  if (existingDraft[0]) {
    return {
      contact,
      emailId: existingDraft[0].id,
      templateType: 'existing_draft',
    };
  }

  const item = await loadInventoryItemById(contentItemId);
  const templateType = item ? pickTemplateType(item) : 'introduction';
  const template = await getEmailTemplateByType(templateType);
  if (!template) {
    throw new Error(`Template not found: ${templateType}`);
  }

  const email = await createOutreachDraft({
    sponsorContactId: contact.id,
    templateId: template.id,
  });

  return { contact, emailId: email.id, templateType };
}
