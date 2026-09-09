/**
 * UX_LANE_STUB API — Contacts & Programs hub.
 * PRIMARY: replace stub handlers with real recommendation / brief / feedback stores.
 * Do not send email, Telegram, or submit forms from these routes.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import {
  CONTACT_INTELLIGENCE_UX_STUB,
  KC_FEEDBACK_ACTIONS,
  KC_HUB_VIEWS,
  getContactBrief,
  getRecommendationBrief,
  listContactIntelligenceHub,
  recordContactIntelligenceFeedback,
  type KcContactIntelligenceFilters,
  type KcHubView,
} from '@social-agent/core/contact-intelligence';

export const contactIntelligenceRoute = new Hono();

function parseBool(value: string | undefined): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function filtersFromQuery(c: { req: { query: (k: string) => string | undefined } }): KcContactIntelligenceFilters {
  return {
    category: c.req.query('category') || null,
    area: c.req.query('area') || null,
    routeType: (c.req.query('routeType') as KcContactIntelligenceFilters['routeType']) || null,
    evidenceState:
      (c.req.query('evidenceState') as KcContactIntelligenceFilters['evidenceState']) || null,
    compensationAccessType:
      (c.req.query('compensationAccessType') as KcContactIntelligenceFilters['compensationAccessType']) ||
      null,
    freshness: (c.req.query('freshness') as KcContactIntelligenceFilters['freshness']) || null,
    hasDirectEmail: parseBool(c.req.query('hasDirectEmail')),
    hasApplicationOrForm: parseBool(c.req.query('hasApplicationOrForm')),
    needsVerification: parseBool(c.req.query('needsVerification')),
    contacted: parseBool(c.req.query('contacted')),
    replied: parseBool(c.req.query('replied')),
    q: c.req.query('q') || null,
  };
}

contactIntelligenceRoute.get('/meta', (c) =>
  c.json({
    ok: true,
    stub: CONTACT_INTELLIGENCE_UX_STUB,
    note: CONTACT_INTELLIGENCE_UX_STUB
      ? 'Thin stub — primary must wire recommendation engine + contact briefs'
      : 'Live contact intelligence hub — recommendations, briefs, feedback; no auto-send',
    views: KC_HUB_VIEWS,
  }),
);

contactIntelligenceRoute.get('/hub', async (c) => {
  const viewRaw = c.req.query('view') ?? 'recommended_now';
  const view = (KC_HUB_VIEWS as readonly string[]).includes(viewRaw)
    ? (viewRaw as KcHubView)
    : 'recommended_now';
  const payload = await listContactIntelligenceHub({
    view,
    filters: filtersFromQuery(c),
  });
  return c.json(payload);
});

contactIntelligenceRoute.get('/briefs/:id', async (c) => {
  const payload = await getContactBrief(c.req.param('id'));
  return c.json(payload);
});

contactIntelligenceRoute.get('/recommendations/:id/brief', async (c) => {
  const payload = await getRecommendationBrief(c.req.param('id'));
  return c.json(payload);
});

const FeedbackSchema = z.object({
  action: z.enum(KC_FEEDBACK_ACTIONS),
  note: z.string().optional().nullable(),
});

contactIntelligenceRoute.post('/recommendations/:id/feedback', async (c) => {
  try {
    const body = FeedbackSchema.parse(await c.req.json());
    const payload = await recordContactIntelligenceFeedback({
      id: c.req.param('id'),
      action: body.action,
      note: body.note,
    });
    return c.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

contactIntelligenceRoute.post('/briefs/:id/feedback', async (c) => {
  try {
    const body = FeedbackSchema.parse(await c.req.json());
    const payload = await recordContactIntelligenceFeedback({
      id: c.req.param('id'),
      action: body.action,
      note: body.note,
    });
    return c.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});
