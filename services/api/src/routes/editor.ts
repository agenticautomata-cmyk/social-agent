import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import { upsertTracking } from '@social-agent/core/editor';
import {
  decideTodayReview,
  loadTodayExecutionWorkspace,
} from '@social-agent/core/inventory';

export const editorRoute = new Hono();

editorRoute.get('/', async (c) => {
  const home = await loadTodayExecutionWorkspace({ demoMode: env.DEMO_MODE });
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

const ReviewActionSchema = z.object({
  contentItemId: z.string().uuid(),
  action: z.enum(['dismiss', 'add_to_today', 'add_to_calendar', 'reviewed']),
});

editorRoute.post('/review', async (c) => {
  const body = await c.req.json();
  const parsed = ReviewActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const result = await decideTodayReview(parsed.data.contentItemId, parsed.data.action);
  return c.json(result);
});
