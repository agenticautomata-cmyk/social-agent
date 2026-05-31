import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { db, contentItems, env, sources } from '@social-agent/core';
import { normalizeInventoryItem } from '@social-agent/core/inventory';
import {
  PLANNER_BOARDS,
  PLANNER_STATUSES,
  computePlannerHub,
  computeShortlistView,
  computeWeeklyPlan,
  loadPlannerForIds,
  plannerToCardTracking,
  upsertPlannerItem,
} from '@social-agent/core/content-planner';

export const contentPlannerRoute = new Hono();

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

contentPlannerRoute.get('/', async (c) => {
  const items = await loadInventoryItems();
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

  const items = await loadInventoryItems();
  const list = await computeShortlistView(items, {
    board: board as (typeof PLANNER_BOARDS)[number] | undefined,
    status: status as (typeof PLANNER_STATUSES)[number] | undefined,
  });
  return c.json({ items: list });
});

contentPlannerRoute.get('/week', async (c) => {
  const items = await loadInventoryItems();
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
    .enum(['save', 'plan_today', 'plan_weekend', 'mark_covered', 'skip'])
    .optional(),
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
