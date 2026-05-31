import { Hono } from 'hono';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { db, contentItems, env, sources } from '@social-agent/core';
import { normalizeInventoryItem } from '@social-agent/core/inventory';
import {
  computeSponsorIntelligence,
  dismissOpportunity,
  addOpportunityToPlanner,
  createDraftOutreachFromOpportunity,
} from '@social-agent/core/sponsor-intelligence';
import {
  createSponsorFromOpportunity,
  getSponsorContactBySourceOpportunity,
} from '@social-agent/core/sponsor-outreach';
import {
  createOpportunityFromIntelligence,
  updateSponsorOpportunity,
  markOpportunityWon,
  markOpportunityLost,
  listSponsorOpportunities,
} from '@social-agent/core/sponsor-pipeline';

export const sponsorIntelligenceRoute = new Hono();

async function loadInventoryItems() {
  const rows = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(isNotNull(contentItems.sourceId))
    .orderBy(desc(contentItems.createdAt));

  return rows.map(({ item, sourceName, sourceType }) =>
    normalizeInventoryItem(item, sourceName, sourceType),
  );
}

sponsorIntelligenceRoute.get('/', async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 6, 1), 20) : 6;

  const items = await loadInventoryItems();
  const intelligence = await computeSponsorIntelligence(items, {
    limit,
    demoMode: env.DEMO_MODE,
  });

  return c.json(intelligence);
});

sponsorIntelligenceRoute.post('/from-opportunity/:contentItemId/lead', async (c) => {
  try {
    const result = await createSponsorFromOpportunity(c.req.param('contentItemId'));
    return c.json(result, result.created ? 201 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    return c.json({ error: message }, 404);
  }
});

sponsorIntelligenceRoute.post('/from-opportunity/:contentItemId/draft-outreach', async (c) => {
  try {
    const result = await createDraftOutreachFromOpportunity(c.req.param('contentItemId'));
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    return c.json({ error: message }, 400);
  }
});

sponsorIntelligenceRoute.post('/from-opportunity/:contentItemId/add-to-planner', async (c) => {
  try {
    await addOpportunityToPlanner(c.req.param('contentItemId'));
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    return c.json({ error: message }, 400);
  }
});

sponsorIntelligenceRoute.post('/from-opportunity/:contentItemId/dismiss', async (c) => {
  try {
    const contact = await dismissOpportunity(c.req.param('contentItemId'));
    return c.json({ contact });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    return c.json({ error: message }, 400);
  }
});

sponsorIntelligenceRoute.post('/from-opportunity/:contentItemId/create-pipeline-opportunity', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await createOpportunityFromIntelligence({
      contentItemId: c.req.param('contentItemId'),
      title: typeof body?.title === 'string' ? body.title : undefined,
      estimatedValue: typeof body?.estimatedValue === 'number' ? body.estimatedValue : undefined,
      plannerListName:
        typeof body?.plannerListName === 'string' ? body.plannerListName : undefined,
    });
    return c.json(result, result.created ? 201 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    return c.json({ error: message }, 400);
  }
});

sponsorIntelligenceRoute.put('/pipeline-opportunity/:id', async (c) => {
  const body = await c.req.json();
  const opportunity = await updateSponsorOpportunity(c.req.param('id'), body);
  if (!opportunity) return c.json({ error: 'not found' }, 404);
  return c.json({ opportunity });
});

sponsorIntelligenceRoute.post('/pipeline-opportunity/:id/won', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const opportunity = await markOpportunityWon(
    c.req.param('id'),
    typeof body?.actualValue === 'number' ? body.actualValue : undefined,
  );
  if (!opportunity) return c.json({ error: 'not found' }, 404);
  return c.json({ opportunity });
});

sponsorIntelligenceRoute.post('/pipeline-opportunity/:id/lost', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const opportunity = await markOpportunityLost(
    c.req.param('id'),
    typeof body?.notes === 'string' ? body.notes : undefined,
  );
  if (!opportunity) return c.json({ error: 'not found' }, 404);
  return c.json({ opportunity });
});

sponsorIntelligenceRoute.get('/from-opportunity/:contentItemId/pipeline-opportunities', async (c) => {
  const contact = await getSponsorContactBySourceOpportunity(c.req.param('contentItemId'));
  if (!contact) {
    return c.json({ contactId: null, opportunities: [] });
  }
  const opportunities = await listSponsorOpportunities({
    sponsorContactId: contact.id,
    openOnly: true,
  });
  return c.json({ contactId: contact.id, opportunities });
});
