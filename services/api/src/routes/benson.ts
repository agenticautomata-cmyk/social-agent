import { Hono } from 'hono';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { db, contentItems, env, sources } from '@social-agent/core';
import { normalizeInventoryItem } from '@social-agent/core/inventory';
import { computeBensonHub } from '@social-agent/core/benson-intelligence';

export const bensonRoute = new Hono();

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

bensonRoute.get('/', async (c) => {
  const items = await loadInventoryItems();
  const hub = await computeBensonHub(items, { demoMode: env.DEMO_MODE });
  return c.json(hub);
});
