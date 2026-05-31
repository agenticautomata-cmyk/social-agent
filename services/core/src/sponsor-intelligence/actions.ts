import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sponsorContacts } from '../schema.js';
import {
  createSponsorFromOpportunity,
  updateSponsorContact,
  loadInventoryItemById,
  type SponsorContactRecord,
} from '../sponsor-outreach/contacts.js';
import { getEmailTemplateByType } from '../sponsor-outreach/templates.js';
import { createOutreachDraft } from '../sponsor-outreach/outreach.js';
import { upsertPlannerItem } from '../content-planner/items.js';
import { pickTemplateType } from './scoring.js';

export async function dismissOpportunity(contentItemId: string): Promise<SponsorContactRecord> {
  const existing = await db
    .select()
    .from(sponsorContacts)
    .where(eq(sponsorContacts.sourceOpportunityId, contentItemId))
    .limit(1);

  if (existing[0]) {
    const updated = await updateSponsorContact(existing[0].id, { status: 'not_interested' });
    return updated!;
  }

  const { contact } = await createSponsorFromOpportunity(contentItemId);
  const updated = await updateSponsorContact(contact.id, { status: 'not_interested' });
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
  const { contact } = await createSponsorFromOpportunity(contentItemId);
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
