import { Hono } from 'hono';
import { z } from 'zod';
import {
  buildPartnershipCreatorPlay,
  getCreatorPartnership,
  listCreatorPartnerships,
  runPartnershipResearch,
  submitCreatorPartnership,
  updatePartnershipStatus,
  listPartnershipActivities,
  confirmPartnershipActivity,
  rejectPartnershipActivity,
  applySuggestedPartnershipStatus,
  getGmailOpenUrl,
  getPartnershipFieldVerification,
  getPartnershipCallLocationScript,
  savePartnershipFieldVerification,
} from '@social-agent/core/creator-partnership';
import {
  INVENTORY_VERIFICATION_STATUSES,
  PARTNERSHIP_PIPELINE_STATUSES,
  PERMISSION_VERIFICATION_STATUSES,
  PROCESS_VERIFICATION_STATUSES,
} from '@social-agent/core/creator-partnership/types';

export const creatorPartnershipsRoute = new Hono();

creatorPartnershipsRoute.get('/', async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Number(limitRaw) : 40;
  const partnerships = await listCreatorPartnerships(Number.isFinite(limit) ? limit : 40);
  return c.json({ ok: true, partnerships });
});

const SubmitSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().optional(),
  sourceScreen: z.string().default('unknown'),
});

creatorPartnershipsRoute.post('/submit', async (c) => {
  try {
    const body = SubmitSchema.parse(await c.req.json());
    if (!body.url && !body.text?.trim()) {
      return c.json({ ok: false, error: 'url_or_text_required' }, 400);
    }
    const result = await submitCreatorPartnership(body);
    const partnership = await getCreatorPartnership(result.partnershipId);
    return c.json({ ok: true, result, partnership });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

creatorPartnershipsRoute.get('/:id/activities', async (c) => {
  const activities = await listPartnershipActivities(c.req.param('id'));
  return c.json({ ok: true, activities });
});

creatorPartnershipsRoute.get('/:id/activities/:activityId/open-email', async (c) => {
  const activities = await listPartnershipActivities(c.req.param('id'));
  const activity = activities.find((a) => a.id === c.req.param('activityId'));
  if (!activity) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, url: await getGmailOpenUrl(activity.gmailMessageId) });
});

creatorPartnershipsRoute.post('/:id/activities/:activityId/confirm', async (c) => {
  const activity = await confirmPartnershipActivity(c.req.param('activityId'));
  if (!activity) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, activity });
});

creatorPartnershipsRoute.post('/:id/activities/:activityId/reject', async (c) => {
  const activity = await rejectPartnershipActivity(c.req.param('activityId'));
  if (!activity) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, activity });
});

creatorPartnershipsRoute.post('/:id/activities/:activityId/apply-status', async (c) => {
  const result = await applySuggestedPartnershipStatus({
    activityId: c.req.param('activityId'),
    partnershipId: c.req.param('id'),
  });
  if (!result.activity) return c.json({ ok: false, error: result.reason ?? 'not_found' }, 404);
  const partnership = await getCreatorPartnership(c.req.param('id'));
  return c.json({ ok: true, ...result, partnership });
});

creatorPartnershipsRoute.get('/:id', async (c) => {
  const partnership = await getCreatorPartnership(c.req.param('id'));
  if (!partnership) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, partnership });
});

creatorPartnershipsRoute.get('/:id/brief', async (c) => {
  const partnership = await getCreatorPartnership(c.req.param('id'));
  if (!partnership) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({
    ok: true,
    partnershipId: partnership.id,
    researchStatus: partnership.researchStatus,
    decisionBrief: partnership.decisionBrief ?? null,
    fitScore: partnership.fitScore,
    needsVerification: partnership.needsVerification,
  });
});

creatorPartnershipsRoute.post('/:id/research', async (c) => {
  try {
    await runPartnershipResearch(c.req.param('id'));
    const partnership = await getCreatorPartnership(c.req.param('id'));
    return c.json({ ok: true, partnership });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

creatorPartnershipsRoute.post('/:id/build-creator-play', async (c) => {
  try {
    await buildPartnershipCreatorPlay(c.req.param('id'));
    const partnership = await getCreatorPartnership(c.req.param('id'));
    return c.json({ ok: true, partnership });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

creatorPartnershipsRoute.get('/:id/field-verification', async (c) => {
  try {
    const data = await getPartnershipFieldVerification(c.req.param('id'));
    return c.json({ ok: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 404);
  }
});

creatorPartnershipsRoute.get('/:id/field-verification/call-location', async (c) => {
  try {
    const locationIndex = Number(c.req.query('locationIndex') ?? '0');
    if (!Number.isFinite(locationIndex) || locationIndex < 0) {
      return c.json({ ok: false, error: 'invalid_location_index' }, 400);
    }
    const script = await getPartnershipCallLocationScript(c.req.param('id'), locationIndex);
    return c.json({ ok: true, script });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 404);
  }
});

const ProvenanceSchema = z.object({
  source: z.literal('field_verification').default('field_verification'),
  channel: z
    .enum([
      'employee_phone_confirmation',
      'manager_phone_confirmation',
      'in_person',
      'creator_observation',
      'other',
    ])
    .default('other'),
  contactName: z.string().nullable().optional(),
  contactRole: z.string().nullable().optional(),
  contactedAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
});

const FieldVerificationResultSchema = z.object({
  taskKey: z.string().min(1),
  locationIndex: z.number().int().nullable().optional(),
  location: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactRole: z.string().nullable().optional(),
  contactedAt: z.string().datetime().nullable().optional(),
  inventoryStatus: z.enum(INVENTORY_VERIFICATION_STATUSES).nullable().optional(),
  pickupStatus: z.enum(PROCESS_VERIFICATION_STATUSES).nullable().optional(),
  shipToStoreStatus: z.enum(PROCESS_VERIFICATION_STATUSES).nullable().optional(),
  sellerIntakeStatus: z.enum(PROCESS_VERIFICATION_STATUSES).nullable().optional(),
  filmingStatus: z.enum(PERMISSION_VERIFICATION_STATUSES).nullable().optional(),
  approvalRequirements: z.string().nullable().optional(),
  followUpContact: z.string().nullable().optional(),
  followUpSuggestion: z.string().nullable().optional(),
  provenance: ProvenanceSchema.optional(),
  notes: z.string().nullable().optional(),
});

creatorPartnershipsRoute.post('/:id/field-verification/results', async (c) => {
  try {
    const body = FieldVerificationResultSchema.parse(await c.req.json());
    const provenance = {
      source: 'field_verification' as const,
      channel: body.provenance?.channel ?? inferVerificationChannel(body.contactRole),
      contactName: body.contactName ?? body.provenance?.contactName ?? null,
      contactRole: body.contactRole ?? body.provenance?.contactRole ?? null,
      contactedAt: body.contactedAt ?? body.provenance?.contactedAt ?? null,
      location: body.location ?? body.provenance?.location ?? null,
    };
    const result = await savePartnershipFieldVerification(c.req.param('id'), {
      taskKey: body.taskKey,
      locationIndex: body.locationIndex ?? null,
      location: body.location ?? null,
      contactName: body.contactName ?? null,
      contactRole: body.contactRole ?? null,
      contactedAt: body.contactedAt ?? null,
      inventoryStatus: body.inventoryStatus ?? null,
      pickupStatus: body.pickupStatus ?? null,
      shipToStoreStatus: body.shipToStoreStatus ?? null,
      sellerIntakeStatus: body.sellerIntakeStatus ?? null,
      filmingStatus: body.filmingStatus ?? null,
      approvalRequirements: body.approvalRequirements ?? null,
      followUpContact: body.followUpContact ?? null,
      followUpSuggestion: body.followUpSuggestion ?? null,
      provenance,
      notes: body.notes ?? null,
    });
    const partnership = await getCreatorPartnership(c.req.param('id'));
    return c.json({ ok: true, ...result, partnership });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

function inferVerificationChannel(
  contactRole: string | null | undefined,
): 'employee_phone_confirmation' | 'manager_phone_confirmation' | 'other' {
  const role = contactRole?.toLowerCase() ?? '';
  if (role.includes('manager') || role.includes('corporate')) return 'manager_phone_confirmation';
  if (contactRole) return 'employee_phone_confirmation';
  return 'other';
}

const StatusSchema = z.object({
  pipelineStatus: z.enum(PARTNERSHIP_PIPELINE_STATUSES),
  followUpAt: z.string().datetime().nullable().optional(),
  calendarReminderAt: z.string().datetime().nullable().optional(),
});

creatorPartnershipsRoute.patch('/:id/status', async (c) => {
  try {
    const body = StatusSchema.parse(await c.req.json());
    await updatePartnershipStatus({
      partnershipId: c.req.param('id'),
      pipelineStatus: body.pipelineStatus,
      followUpAt: body.followUpAt,
      calendarReminderAt: body.calendarReminderAt,
    });
    const partnership = await getCreatorPartnership(c.req.param('id'));
    return c.json({ ok: true, partnership });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});
