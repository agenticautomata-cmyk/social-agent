import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import { SPONSOR_PIPELINE_STATUSES } from '@social-agent/core/sponsor-pipeline';
import {
  computeActionCenter,
  executeActionCenterAction,
} from '@social-agent/core/action-center';
import { parseExcludeCategoriesQuery } from '../lib/inventory-query.js';

export const actionCenterRoute = new Hono();

actionCenterRoute.get('/', async (c) => {
  const excludeCategories = parseExcludeCategoriesQuery(c.req.query('excludeCategories'));
  const hub = await computeActionCenter({ demoMode: env.DEMO_MODE, excludeCategories });
  return c.json(hub);
});

actionCenterRoute.get('/notifications', async (c) => {
  const excludeCategories = parseExcludeCategoriesQuery(c.req.query('excludeCategories'));
  const hub = await computeActionCenter({ demoMode: env.DEMO_MODE, excludeCategories });
  return c.json({
    demoMode: hub.demoMode,
    generatedAt: hub.generatedAt,
    notifications: hub.notifications,
    counts: hub.counts,
  });
});

const ExecuteSchema = z.object({
  action: z.enum([
    'send_email',
    'start_pitch',
    'schedule_follow_up',
    'mark_covered',
    'move_opportunity_stage',
    'create_planner_item',
    'assign_due_date',
    'approve_email',
  ]),
  entityType: z.enum(['planner', 'pipeline', 'outreach', 'sponsor_contact', 'intake']),
  entityId: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  followUpAt: z.string().nullable().optional(),
  status: z.enum(SPONSOR_PIPELINE_STATUSES).optional(),
  plannerAction: z.enum(['save', 'plan_today', 'plan_weekend']).optional(),
  listName: z.string().optional(),
});

actionCenterRoute.post('/execute', async (c) => {
  const body = await c.req.json();
  const parsed = ExecuteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const result = await executeActionCenterAction(parsed.data);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Action failed';
    return c.json({ error: message }, 400);
  }
});
