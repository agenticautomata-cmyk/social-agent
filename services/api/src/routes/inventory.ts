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
  loadMapOpportunitySources,
  buildMapOpportunities,
  MAP_DATE_PRESETS,
  MAP_SORT_OPTIONS,
  isValidCoverageFormatFilter,
  type InventoryPresetId,
  type InventorySortId,
  type MapDatePreset,
  type MapOpportunityFilters,
  type MapSortId,
} from '@social-agent/core/inventory';
import { loadAllPlannerItems } from '@social-agent/core/content-planner';
import {
  COVERAGE_FORMATS,
  getCoverageFormat,
  setCoverageFormat,
  refreshSuggestedCoverageFormat,
} from '@social-agent/core/coverage-format';
import {
  loadGreenScreenPackage,
  prepareGreenScreenPackage,
  saveGreenScreenPackage,
  markGreenScreenStatus,
} from '@social-agent/core/green-screen';
import {
  clearOpportunityLocation,
  getOpportunityLocation,
  markOpportunityLocationNotApplicable,
  markOpportunityLocationVerified,
  resolveOpportunityLocationWithDiagnostics,
  selectOpportunityLocationCandidate,
} from '@social-agent/core/opportunity-location';

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

const MapQuerySchema = z.object({
  datePreset: z.enum(MAP_DATE_PRESETS).optional().default('next_30_days'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  coverageFormat: z.string().optional(),
  state: z.string().optional(),
  category: z.string().optional(),
  source: z.string().optional(),
  minScore: z.coerce.number().optional(),
  locationStatus: z.enum(['resolved_verified', 'include_needs_review']).optional().default('resolved_verified'),
  selectedForFilming: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
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
  sort: z.enum(MAP_SORT_OPTIONS).optional().default('soonest'),
});

inventoryRoute.get('/map', async (c) => {
  const parsed = MapQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid query', issues: parsed.error.issues }, 400);

  const q = parsed.data;
  if (q.coverageFormat && !isValidCoverageFormatFilter(q.coverageFormat)) {
    return c.json({ error: 'invalid coverageFormat' }, 400);
  }

  const [items, plannerMap] = await Promise.all([loadMapOpportunitySources(), loadAllPlannerItems()]);
  const result = buildMapOpportunities(
    items,
    plannerMap,
    {
      datePreset: q.datePreset as MapDatePreset,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      coverageFormat: q.coverageFormat as MapOpportunityFilters['coverageFormat'],
      state: q.state,
      category: q.category,
      source: q.source,
      minScore: q.minScore,
      locationStatus: q.locationStatus,
      selectedForFilming: q.selectedForFilming,
      excludeCategories: q.excludeCategories.length > 0 ? q.excludeCategories : undefined,
    },
    q.sort as MapSortId,
  );

  return c.json({
    demoMode: env.DEMO_MODE,
    mapConfigured: true,
    usesStoredCoordinatesOnly: true,
    count: result.visibleCount,
    hiddenUnresolvedCount: result.hiddenUnresolvedCount,
    hiddenNotApplicableCount: result.hiddenNotApplicableCount,
    hiddenExpiredCount: result.hiddenExpiredCount,
    filterOptions: result.filterOptions,
    pins: result.pins,
    groups: result.groups,
  });
});

const CoverageFormatSchema = z.object({
  coverageFormat: z.enum(COVERAGE_FORMATS).nullable(),
  firsthandVisited: z.boolean().optional(),
});

inventoryRoute.put('/:id/coverage-format', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = CoverageFormatSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400);

  const row = await db.query.contentItems.findFirst({ where: eq(contentItems.id, id) });
  if (!row) return c.json({ error: 'not found' }, 404);

  await setCoverageFormat(id, {
    coverageFormat: parsed.data.coverageFormat,
    firsthandVisited: parsed.data.firsthandVisited,
  });
  if (!parsed.data.coverageFormat) {
    await refreshSuggestedCoverageFormat(id);
  }

  const updated = await getCoverageFormat(id);
  return c.json({ ok: true, ...updated });
});

const GreenScreenPatchSchema = z.object({
  suggestedHeadline: z.string().nullable().optional(),
  openingHook: z.string().nullable().optional(),
  spokenScript: z.string().nullable().optional(),
  keyFacts: z.array(z.string()).optional(),
  eventDates: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  priceOrOffer: z.string().nullable().optional(),
  restrictions: z.string().nullable().optional(),
  backgroundSources: z.array(z.object({ label: z.string(), url: z.string().nullable() })).optional(),
  onScreenText: z.array(z.string()).optional(),
  caption: z.string().nullable().optional(),
  hashtags: z.array(z.string()).optional(),
  callToAction: z.string().nullable().optional(),
  sourceAttribution: z.string().nullable().optional(),
  visitLaterNotes: z.string().nullable().optional(),
});

inventoryRoute.get('/:id/green-screen', async (c) => {
  const id = c.req.param('id');
  const row = await db.query.contentItems.findFirst({ where: eq(contentItems.id, id) });
  if (!row) return c.json({ error: 'not found' }, 404);
  const pkg = await loadGreenScreenPackage(id);
  const coverage = await getCoverageFormat(id);
  return c.json({ ok: true, package: pkg, coverage });
});

inventoryRoute.post('/:id/green-screen/prepare', async (c) => {
  const id = c.req.param('id');
  try {
    const pkg = await prepareGreenScreenPackage(id);
    return c.json({ ok: true, package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

inventoryRoute.put('/:id/green-screen', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = GreenScreenPatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400);
  try {
    const pkg = await saveGreenScreenPackage(id, parsed.data);
    return c.json({ ok: true, package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

inventoryRoute.post('/:id/green-screen/mark-prepared', async (c) => {
  const id = c.req.param('id');
  try {
    const pkg = await markGreenScreenStatus(id, 'prepared');
    return c.json({ ok: true, package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

inventoryRoute.post('/:id/green-screen/mark-completed', async (c) => {
  const id = c.req.param('id');
  try {
    const pkg = await markGreenScreenStatus(id, 'completed');
    return c.json({ ok: true, package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
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

  if (!row.item.suggestedCoverageFormat) {
    await refreshSuggestedCoverageFormat(id);
  }

  const [coverage, greenScreenPackage, location] = await Promise.all([
    getCoverageFormat(id),
    loadGreenScreenPackage(id),
    getOpportunityLocation(id),
  ]);

  return c.json({
    demoMode: env.DEMO_MODE,
    item: normalizeInventoryItem(row.item, row.sourceName, row.sourceType),
    industryName: row.industryName,
    personaName: row.personaName,
    raw: row.item,
    coverage,
    greenScreenPackage,
    location,
  });
});

inventoryRoute.get('/:id/location', async (c) => {
  const id = c.req.param('id');
  const location = await getOpportunityLocation(id);
  if (!location) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true, location });
});

inventoryRoute.post('/:id/location/resolve', async (c) => {
  const id = c.req.param('id');
  try {
    const { record, providerDiagnostics } = await resolveOpportunityLocationWithDiagnostics(id);
    return c.json({ ok: true, location: record, providerDiagnostics });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

const SelectCandidateSchema = z.object({
  placeId: z.string().min(1),
});

inventoryRoute.post('/:id/location/select', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = SelectCandidateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400);
  try {
    const location = await selectOpportunityLocationCandidate(id, parsed.data.placeId);
    return c.json({ ok: true, location });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

inventoryRoute.post('/:id/location/verify', async (c) => {
  const id = c.req.param('id');
  try {
    const location = await markOpportunityLocationVerified(id);
    return c.json({ ok: true, location });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

inventoryRoute.post('/:id/location/clear', async (c) => {
  const id = c.req.param('id');
  try {
    const location = await clearOpportunityLocation(id);
    return c.json({ ok: true, location });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

inventoryRoute.post('/:id/location/not-applicable', async (c) => {
  const id = c.req.param('id');
  try {
    const location = await markOpportunityLocationNotApplicable(id);
    return c.json({ ok: true, location });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});
