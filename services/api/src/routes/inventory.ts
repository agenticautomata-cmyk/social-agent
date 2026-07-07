import { Hono } from 'hono';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, contentItems, env, industries, personas, sources } from '@social-agent/core';
import { contentItemsChronologicalOrder } from '@social-agent/core/content-order';
import {
  normalizeInventoryItem,
  computeInventoryStats,
  applyInventoryPreset,
  sortInventoryItems,
  searchInventoryItems,
  filterInventoryItems,
  computeEditorialPicks,
  type InventoryPresetId,
  type InventorySortId,
} from '@social-agent/core/inventory';

export const inventoryRoute = new Hono();

const QuerySchema = z.object({
  ingestedOnly: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),
  source: z.string().optional(),
  category: z.string().optional(),
  excludeCategories: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
  state: z.string().optional(),
  neighborhood: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  flag: z
    .enum([
      'sponsorFriendly',
      'luxury',
      'dining',
      'dateNight',
      'estateSale',
      'businessOpening',
      'freeEvent',
      'celebrityCharity',
      'sports',
      'reddit',
      'worldCup',
      'shopping',
      'retail',
      'vendorMarket',
      'collector',
    ])
    .optional(),
  search: z.string().optional(),
  sort: z
    .enum([
      'event_date',
      'newest',
      'oldest',
      'source',
      'category',
      'title',
      'sponsor_first',
      'audience_first',
    ])
    .optional()
    .default('event_date'),
  preset: z
    .enum([
      'all',
      'sponsor_friendly',
      'luxury_date_night',
      'dining_openings',
      'estate_sales',
      'deals_discounts',
      'luxury_deals',
      'major_events',
      'free_things',
      'celebrity_charity',
      'world_cup',
      'reddit_only',
      'hide_reddit',
      'shopping_retail',
    ])
    .optional()
    .default('all'),
});

inventoryRoute.get('/stats', async (c) => {
  const ingestedOnly = c.req.query('ingestedOnly') !== 'false';

  const rows = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(ingestedOnly ? isNotNull(contentItems.sourceId) : undefined)
    .orderBy(desc(contentItems.createdAt));

  const items = rows.map(({ item, sourceName, sourceType }) =>
    normalizeInventoryItem(item, sourceName, sourceType),
  );

  return c.json({
    demoMode: env.DEMO_MODE,
    stats: computeInventoryStats(items),
  });
});

async function loadIngestedInventoryItems() {
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

inventoryRoute.get('/editorial-picks', async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 10, 1), 20) : 10;
  const excludeRaw = c.req.query('excludeCategories');
  const excludeCategories = excludeRaw
    ? excludeRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  let items = await loadIngestedInventoryItems();
  if (excludeCategories.length > 0) {
    items = filterInventoryItems(items, { excludeCategories });
  }

  return c.json({
    demoMode: env.DEMO_MODE,
    ...computeEditorialPicks(items, { limit }),
  });
});

inventoryRoute.get('/', async (c) => {
  const parsed = QuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid query', issues: parsed.error.issues }, 400);

  const q = parsed.data;

  const rows = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(q.ingestedOnly ? isNotNull(contentItems.sourceId) : undefined)
    .orderBy(...contentItemsChronologicalOrder);

  let items = rows.map(({ item, sourceName, sourceType }) =>
    normalizeInventoryItem(item, sourceName, sourceType),
  );

  const stats = computeInventoryStats(items);

  items = applyInventoryPreset(items, q.preset as InventoryPresetId);
  items = filterInventoryItems(items, {
    source: q.source,
    category: q.category,
    excludeCategories: q.excludeCategories.length > 0 ? q.excludeCategories : undefined,
    state: q.state,
    neighborhood: q.neighborhood,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    flag: q.flag,
    excludeReddit: q.preset === 'hide_reddit' ? false : undefined,
  });
  if (q.search) items = searchInventoryItems(items, q.search);
  items = sortInventoryItems(items, q.sort as InventorySortId);

  const filterOptions = {
    sources: stats.bySource.map((s) => s.sourceName),
    categories: stats.byCategory.map((c) => c.category),
    states: stats.byState.map((s) => s.state),
  };

  return c.json({
    demoMode: env.DEMO_MODE,
    stats,
    filterOptions,
    totalUnfiltered: stats.total,
    count: items.length,
    items,
  });
});

inventoryRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [row] = await db
    .select({
      item: contentItems,
      industryName: industries.name,
      personaName: personas.name,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(industries, eq(industries.id, contentItems.industryId))
    .leftJoin(personas, eq(personas.id, contentItems.personaId))
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(eq(contentItems.id, id))
    .limit(1);

  if (!row) return c.json({ error: 'not found' }, 404);

  return c.json({
    demoMode: env.DEMO_MODE,
    item: normalizeInventoryItem(row.item, row.sourceName, row.sourceType),
    industryName: row.industryName,
    personaName: row.personaName,
    raw: row.item,
  });
});
