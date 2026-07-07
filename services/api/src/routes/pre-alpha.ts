import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  computePreAlphaHome,
  computePreAlphaStatus,
  createTesterFeedback,
  FEEDBACK_REASON_CODES,
  listRecentTesterFeedback,
} from '@social-agent/core/pre-alpha';
import { parseExcludeCategoriesQuery } from '../lib/inventory-query.js';

export const preAlphaRoute = new Hono();

preAlphaRoute.get('/status', async (c) => {
  const status = await computePreAlphaStatus();
  return c.json(status, status.ok ? 200 : 503);
});

preAlphaRoute.get('/home', async (c) => {
  const excludeCategories = parseExcludeCategoriesQuery(c.req.query('excludeCategories'));
  const home = await computePreAlphaHome({
    demoMode: env.DEMO_MODE,
    excludeCategories,
  });
  return c.json(home);
});

preAlphaRoute.get('/feedback/reasons', (c) => {
  return c.json({ reasonCodes: FEEDBACK_REASON_CODES });
});

const FeedbackSchema = z.object({
  kind: z.enum(['feedback', 'bug']),
  route: z.string().min(1).max(500),
  pageTitle: z.string().max(200).optional(),
  sentiment: z.enum(['up', 'down']).optional(),
  reasonCode: z.string().max(64).optional(),
  comment: z.string().max(4000).optional(),
  expectedBehavior: z.string().max(2000).optional(),
  userEmail: z.union([z.string().email().max(200), z.literal('')]).optional(),
  userAgent: z.string().max(500).optional(),
  viewport: z.string().max(120).optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.string().max(64).optional(),
});

preAlphaRoute.post('/feedback', async (c) => {
  const body = await c.req.json();
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const record = await createTesterFeedback({
      ...parsed.data,
      userEmail: parsed.data.userEmail || undefined,
    });
    return c.json({ ok: true, feedback: record }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save feedback';
    return c.json({ error: message }, 400);
  }
});

preAlphaRoute.get('/feedback', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '30', 10) || 30, 100);
  const feedback = await listRecentTesterFeedback(limit);
  return c.json({ feedback });
});
