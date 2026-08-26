import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  listSponsorContacts,
  getSponsorContact,
  getBusinessGroupContacts,
  createSponsorContact,
  createSponsorFromOpportunity,
  updateSponsorContact,
  loadInventoryItemById,
  listOutreachEmailsForContactIds,
  enrichOutreachEmails,
  SPONSOR_CONTACT_STATUSES,
  SponsorBusinessIdentityRejectedError,
} from '@social-agent/core/sponsor-outreach';
import { getSponsorPipelineSummary } from '@social-agent/core/sponsor-pipeline';
import { getPlannedContentForSponsor } from '@social-agent/core/benson-intelligence';

export const sponsorsRoute = new Hono();

sponsorsRoute.get('/', async (c) => {
  const contacts = await listSponsorContacts();
  return c.json({ contacts, demoMode: env.DEMO_MODE });
});

sponsorsRoute.post('/from-opportunity/:contentItemId', async (c) => {
  try {
    const result = await createSponsorFromOpportunity(c.req.param('contentItemId'));
    return c.json(result, result.created ? 201 : 200);
  } catch (err) {
    if (err instanceof SponsorBusinessIdentityRejectedError) {
      return c.json({ error: err.message, code: err.code, reason: err.reason }, 400);
    }
    const message = err instanceof Error ? err.message : 'Failed to create sponsor';
    return c.json({ error: message }, 404);
  }
});

sponsorsRoute.get('/:id', async (c) => {
  const contact = await getSponsorContact(c.req.param('id'));
  if (!contact) return c.json({ error: 'not found' }, 404);

  let sourceOpportunity = null;
  if (contact.sourceOpportunityId) {
    sourceOpportunity = await loadInventoryItemById(contact.sourceOpportunityId);
  }

  const pipeline = await getSponsorPipelineSummary(contact.id);

  const titleByContentId = new Map<string, string>();
  if (sourceOpportunity) {
    titleByContentId.set(sourceOpportunity.id, sourceOpportunity.title);
  }
  const plannedContentRaw = await getPlannedContentForSponsor(contact.id, titleByContentId);
  const plannedContent = await Promise.all(
    plannedContentRaw.map(async (entry) => {
      if (titleByContentId.has(entry.contentItemId)) return entry;
      const item = await loadInventoryItemById(entry.contentItemId);
      return { ...entry, title: item?.title ?? entry.title };
    }),
  );

  // Every contact row that shares this business's canonical identity (see canonicalize.ts) —
  // lets the detail page show one business profile with full outreach/draft history even
  // when Benson previously created several duplicate contact rows for the same business.
  const groupContacts = await getBusinessGroupContacts(contact.id);
  const groupContactIds = groupContacts.length > 0 ? groupContacts.map((c) => c.id) : [contact.id];
  const groupEmails = await listOutreachEmailsForContactIds(groupContactIds);
  const outreachHistory = await enrichOutreachEmails(groupEmails);
  const duplicateContacts = groupContacts.filter((c) => c.id !== contact.id);

  return c.json({ contact, sourceOpportunity, pipeline, plannedContent, outreachHistory, duplicateContacts });
});

const ContactCreateSchema = z.object({
  businessName: z.string().min(1),
  contactName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  tiktok: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sponsorFitScore: z.number().nullable().optional(),
  sourceOpportunityId: z.string().uuid().nullable().optional(),
  status: z.enum(SPONSOR_CONTACT_STATUSES).optional(),
});

sponsorsRoute.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = ContactCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const contact = await createSponsorContact({ ...parsed.data, operatorProvided: true });
    return c.json({ contact }, 201);
  } catch (err) {
    if (err instanceof SponsorBusinessIdentityRejectedError) {
      return c.json({ error: err.message, code: err.code, reason: err.reason }, 400);
    }
    throw err;
  }
});

const ContactUpdateSchema = ContactCreateSchema.partial().omit({ businessName: true }).extend({
  businessName: z.string().min(1).optional(),
  lastContactedAt: z.string().nullable().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
});

sponsorsRoute.put('/:id', async (c) => {
  const body = await c.req.json();
  const parsed = ContactUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const contact = await updateSponsorContact(c.req.param('id'), parsed.data);
  if (!contact) return c.json({ error: 'not found' }, 404);
  return c.json({ contact });
});
