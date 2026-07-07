import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  PLANNER_BOARDS,
  PLANNER_STATUSES,
  computePlannerHub,
  computeShortlistView,
  computeWeeklyPlan,
  loadPlannerForIds,
  plannerToCardTracking,
  upsertPlannerItem,
  batchUpsertPlannerItems,
  generatePlannerCaption,
} from '@social-agent/core/content-planner';
import {
  loadFilteredIngestedInventory,
  parseExcludeCategoriesQuery,
} from '../lib/inventory-query.js';

export const contentPlannerRoute = new Hono();

contentPlannerRoute.get('/', async (c) => {
  const excludeCategories = parseExcludeCategoriesQuery(c.req.query('excludeCategories'));
  const items = await loadFilteredIngestedInventory(excludeCategories);
  const hub = await computePlannerHub(items, { demoMode: env.DEMO_MODE });
  return c.json(hub);
});

contentPlannerRoute.get('/items/:contentItemId', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const map = await loadPlannerForIds([contentItemId]);
  const record = map.get(contentItemId);
  if (!record) {
    return c.json({ item: null });
  }
  return c.json({ item: record, tracking: plannerToCardTracking(record) });
});

contentPlannerRoute.get('/items', async (c) => {
  const board = c.req.query('board');
  const status = c.req.query('status');

  if (board && !PLANNER_BOARDS.includes(board as (typeof PLANNER_BOARDS)[number])) {
    return c.json({ error: 'invalid board' }, 400);
  }
  if (status && !PLANNER_STATUSES.includes(status as (typeof PLANNER_STATUSES)[number])) {
    return c.json({ error: 'invalid status' }, 400);
  }

  const excludeCategories = parseExcludeCategoriesQuery(c.req.query('excludeCategories'));
  const items = await loadFilteredIngestedInventory(excludeCategories);
  const list = await computeShortlistView(items, {
    board: board as (typeof PLANNER_BOARDS)[number] | undefined,
    status: status as (typeof PLANNER_STATUSES)[number] | undefined,
  });
  return c.json({ items: list });
});

contentPlannerRoute.get('/week', async (c) => {
  const excludeCategories = parseExcludeCategoriesQuery(c.req.query('excludeCategories'));
  const items = await loadFilteredIngestedInventory(excludeCategories);
  const week = await computeWeeklyPlan(items);
  return c.json(week);
});

const PlannerUpdateSchema = z.object({
  listName: z.string().optional(),
  notes: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(3).optional(),
  plannedDate: z.string().nullable().optional(),
  contentAngle: z.string().nullable().optional(),
  status: z.enum(PLANNER_STATUSES).optional(),
  followUpAt: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  action: z
    .enum(['save', 'plan_today', 'plan_this_week', 'plan_weekend', 'mark_covered', 'skip'])
    .optional(),
  draftCaption: z.string().nullable().optional(),
  postedUrl: z.string().nullable().optional(),
  postedAt: z.string().nullable().optional(),
});

const BatchUpdateSchema = z.object({
  contentItemIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum([
    'save',
    'plan_today',
    'plan_this_week',
    'plan_weekend',
    'mark_covered',
    'skip',
    'dismiss',
  ]),
});

contentPlannerRoute.post('/items/batch', async (c) => {
  const body = await c.req.json();
  const parsed = BatchUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const result = await batchUpsertPlannerItems(parsed.data.contentItemIds, parsed.data.action);
  return c.json({ ok: true, ...result });
});

contentPlannerRoute.post('/items/:contentItemId/caption', async (c) => {
  try {
    const result = await generatePlannerCaption(c.req.param('contentItemId'));
    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Caption generation failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

contentPlannerRoute.post('/items/:contentItemId/mark-posted', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const body = z
    .object({ postedUrl: z.string().url().nullable().optional() })
    .parse(await c.req.json().catch(() => ({})));

  const now = new Date().toISOString();
  const record = await upsertPlannerItem(contentItemId, {
    action: 'mark_covered',
    postedUrl: body.postedUrl ?? null,
    postedAt: now,
  });
  return c.json({ ok: true, item: record });
});

contentPlannerRoute.put('/items/:contentItemId', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const body = await c.req.json();
  const parsed = PlannerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const record = await upsertPlannerItem(contentItemId, parsed.data);
  return c.json({ ok: true, item: record });
});
