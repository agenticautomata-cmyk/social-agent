import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { db, contentItems, env, sources } from '@social-agent/core';
import { normalizeInventoryItem } from '@social-agent/core/inventory';
import { upsertTracking } from '@social-agent/core/editor';
import { computeBensonEditorHome } from '@social-agent/core/benson-intelligence';

export const editorRoute = new Hono();

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

editorRoute.get('/', async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 6, 1), 20) : 6;

  const items = await loadInventoryItems();
  const home = await computeBensonEditorHome(items, { limit, demoMode: env.DEMO_MODE });

  return c.json(home);
});

const TrackingUpdateSchema = z.object({
  saved: z.boolean().optional(),
  covered: z.boolean().optional(),
  note: z.string().nullable().optional(),
  followUpAt: z.string().nullable().optional(),
});

editorRoute.put('/tracking/:contentItemId', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const body = await c.req.json();
  const parsed = TrackingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const record = await upsertTracking(contentItemId, parsed.data);
  return c.json({ ok: true, tracking: record });
});
