import { Hono } from 'hono';
import { z } from 'zod';
import {
  addToToday,
  expressCreatorInterest,
  getDiscoveryRecord,
  saveAssistancePackage,
  describeInterestNextStep,
  listBensonDiscoverySources,
  listOpenDiscoveries,
  retryResearchJob,
  runResearchJob,
  generateAssistancePackage,
  runBusinessEnrichment,
} from '@social-agent/core/creator-interest';
import { INTEREST_ACTIONS } from '@social-agent/core/creator-interest/types';
import {
  createSponsorFromOpportunity,
  getSponsorContactBySourceOpportunity,
  contactConfidenceForStatus,
  noContactFoundMessage,
  recordManualBusinessContact,
  MANUAL_CONTACT_CHANNELS,
} from '@social-agent/core/sponsor-outreach';
import { getPipelineRelationshipForContact } from '@social-agent/core/sponsor-pipeline';

export const creatorInterestRoute = new Hono();

creatorInterestRoute.get('/discoveries/feed', async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Number(limitRaw) : 40;
  const discoveries = await listOpenDiscoveries(Number.isFinite(limit) ? limit : 40);
  return c.json({ ok: true, discoveries });
});

creatorInterestRoute.get('/discoveries', async (c) => {
  const discoveries = await listBensonDiscoverySources();
  return c.json({ ok: true, discoveries });
});

creatorInterestRoute.get('/records/:contentItemId', async (c) => {
  const record = await getDiscoveryRecord(c.req.param('contentItemId'));
  if (!record) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, record });
});

const ActionSchema = z.object({
  action: z.enum(INTEREST_ACTIONS),
  sourceScreen: z.string().default('unknown'),
  requestedAssistance: z.array(z.string()).optional(),
});

creatorInterestRoute.post('/records/:contentItemId/interest', async (c) => {
  try {
    const body = ActionSchema.parse(await c.req.json());
    const result = await expressCreatorInterest({
      contentItemId: c.req.param('contentItemId'),
      action: body.action,
      sourceScreen: body.sourceScreen,
      requestedAssistance: body.requestedAssistance,
    });
    const record = await getDiscoveryRecord(result.contentItemId);
    return c.json({ ok: true, result, record, nextStep: describeInterestNextStep(body.action) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

creatorInterestRoute.post('/records/:contentItemId/add-to-today', async (c) => {
  await addToToday(c.req.param('contentItemId'));
  return c.json({ ok: true });
});

creatorInterestRoute.post('/research/:jobId/retry', async (c) => {
  try {
    await retryResearchJob(c.req.param('jobId'));
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

creatorInterestRoute.post('/research/:jobId/run', async (c) => {
  await runResearchJob(c.req.param('jobId'));
  return c.json({ ok: true });
});

creatorInterestRoute.post('/records/:contentItemId/regenerate-package', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const record = await getDiscoveryRecord(contentItemId);
  if (!record?.enrichment) return c.json({ ok: false, error: 'enrichment_required' }, 400);
  const enrichment = await runBusinessEnrichment(contentItemId);
  const pkg = await generateAssistancePackage({
    title: record.title,
    summary: record.summary,
    enrichment,
    category: record.category,
  });
  const saved = await saveAssistancePackage(contentItemId, pkg, 'replace');
  return c.json({ ok: true, assistancePackage: saved ?? pkg });
});

const AssistancePackagePatchSchema = z.object({
  contentPackage: z.record(z.unknown()).optional(),
  visitPlan: z.record(z.unknown()).optional(),
  businessAction: z.record(z.unknown()).optional(),
});

creatorInterestRoute.patch('/records/:contentItemId/assistance-package', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const body = AssistancePackagePatchSchema.parse(await c.req.json());
  const saved = await saveAssistancePackage(contentItemId, body as never, 'merge');
  if (!saved) return c.json({ ok: false, error: 'No interest record found for this discovery yet' }, 404);
  return c.json({ ok: true, assistancePackage: saved });
});

/**
 * P7D — scoped contact-business view. Finds or creates the one canonical sponsor contact for
 * this discovery (never a second row for the same business — see createSponsorFromOpportunity)
 * and returns real contact-confidence data plus the current relationship stage, so the UI never
 * has to fall back to a generic 140-row CRM list.
 */
creatorInterestRoute.get('/records/:contentItemId/contact', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const existing = await getSponsorContactBySourceOpportunity(contentItemId);
  let contact = existing;
  if (!contact) {
    try {
      const result = await createSponsorFromOpportunity(contentItemId);
      contact = result.contact;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: message }, 404);
    }
  }

  const confidence = contactConfidenceForStatus(contact.contactVerificationStatus);
  const relationship = await getPipelineRelationshipForContact(contact.id);

  return c.json({
    ok: true,
    contact,
    confidence,
    noContactMessage: confidence.usable ? null : noContactFoundMessage(!!contact.website),
    relationship,
  });
});

const ContactActionSchema = z.object({
  channel: z.enum(MANUAL_CONTACT_CHANNELS),
  note: z.string().max(2000).optional(),
});

/**
 * P7E — records one real, already-completed outreach action against the canonical sponsor
 * contact for this discovery. Never sends anything itself; the creator confirms an action they
 * already took outside Benson (site form, DM, phone, in-person, or an email sent from their own
 * inbox), and this updates the CRM stage, schedules a follow-up, and makes the relationship
 * visible on /pipeline without requiring a separate manual deal object.
 */
creatorInterestRoute.post('/records/:contentItemId/contact-actions', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  try {
    const body = ContactActionSchema.parse(await c.req.json());
    let contact = await getSponsorContactBySourceOpportunity(contentItemId);
    if (!contact) {
      const result = await createSponsorFromOpportunity(contentItemId);
      contact = result.contact;
    }
    const { email } = await recordManualBusinessContact({
      sponsorContactId: contact.id,
      channel: body.channel,
      note: body.note,
    });
    const relationship = await getPipelineRelationshipForContact(contact.id);
    return c.json({ ok: true, outreachEmailId: email.id, relationship });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});
