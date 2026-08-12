import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  SPONSOR_PIPELINE_STATUSES,
  listSponsorOpportunities,
  getSponsorOpportunity,
  enrichOpportunities,
  createSponsorOpportunity,
  updateSponsorOpportunity,
  markOpportunityWon,
  markOpportunityLost,
  computePipelineDashboard,
  computePipelineReporting,
  createOpportunityFromIntelligence,
  listPipelineRelationships,
} from '@social-agent/core/sponsor-pipeline';

export const pipelineRoute = new Hono();

pipelineRoute.get('/', async (c) => {
  const dashboard = await computePipelineDashboard();
  return c.json({ demoMode: env.DEMO_MODE, ...dashboard });
});

pipelineRoute.get('/relationships', async (c) => {
  const relationships = await listPipelineRelationships();
  return c.json({ ok: true, relationships, calculatedAt: new Date().toISOString() });
});

pipelineRoute.get('/reporting', async (c) => {
  const reporting = await computePipelineReporting();
  return c.json({ demoMode: env.DEMO_MODE, ...reporting });
});

pipelineRoute.get('/opportunities', async (c) => {
  const sponsorContactId = c.req.query('sponsorContactId');
  const openOnly = c.req.query('openOnly') === 'true';
  const opportunities = await listSponsorOpportunities({
    sponsorContactId: sponsorContactId ?? undefined,
    openOnly: openOnly || undefined,
  });
  const enriched = await enrichOpportunities(opportunities);
  return c.json({ opportunities: enriched });
});

pipelineRoute.get('/opportunities/:id', async (c) => {
  const opp = await getSponsorOpportunity(c.req.param('id'));
  if (!opp) return c.json({ error: 'not found' }, 404);
  const [enriched] = await enrichOpportunities([opp]);
  return c.json({ opportunity: enriched });
});

const CreateSchema = z.object({
  sponsorContactId: z.string().uuid(),
  title: z.string().min(1),
  estimatedValue: z.number().nullable().optional(),
  actualValue: z.number().nullable().optional(),
  status: z.enum(SPONSOR_PIPELINE_STATUSES).optional(),
  notes: z.string().nullable().optional(),
  leadSource: z.string().nullable().optional(),
  plannerListName: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

pipelineRoute.post('/opportunities', async (c) => {
  const body = await c.req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const opportunity = await createSponsorOpportunity(parsed.data);
    return c.json({ opportunity }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create';
    return c.json({ error: message }, 400);
  }
});

const UpdateSchema = CreateSchema.partial().omit({ sponsorContactId: true });

pipelineRoute.put('/opportunities/:id', async (c) => {
  const body = await c.req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const opportunity = await updateSponsorOpportunity(c.req.param('id'), parsed.data);
  if (!opportunity) return c.json({ error: 'not found' }, 404);
  return c.json({ opportunity });
});

pipelineRoute.post('/opportunities/:id/won', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const actualValue =
    typeof body?.actualValue === 'number' ? body.actualValue : undefined;
  const opportunity = await markOpportunityWon(c.req.param('id'), actualValue);
  if (!opportunity) return c.json({ error: 'not found' }, 404);
  return c.json({ opportunity });
});

pipelineRoute.post('/opportunities/:id/lost', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const notes = typeof body?.notes === 'string' ? body.notes : undefined;
  const opportunity = await markOpportunityLost(c.req.param('id'), notes);
  if (!opportunity) return c.json({ error: 'not found' }, 404);
  return c.json({ opportunity });
});

pipelineRoute.post('/from-intelligence/:contentItemId', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    title: z.string().optional(),
    estimatedValue: z.number().nullable().optional(),
    plannerListName: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(body);

  try {
    const result = await createOpportunityFromIntelligence({
      contentItemId: c.req.param('contentItemId'),
      title: parsed.success ? parsed.data.title : undefined,
      estimatedValue: parsed.success ? parsed.data.estimatedValue : undefined,
      plannerListName: parsed.success ? parsed.data.plannerListName : undefined,
    });
    return c.json(result, result.created ? 201 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    return c.json({ error: message }, 400);
  }
});
