import { Hono } from 'hono';
import { buildSpendSummary } from '@social-agent/core/llm-spend';
import { isControlTowerAuthorized, controlTowerUnauthorizedMessage } from '../lib/admin-auth.js';

export const adminSpendRoute = new Hono();

adminSpendRoute.use('*', async (c, next) => {
  const key = c.req.header('x-benson-admin-key');
  if (!isControlTowerAuthorized(key)) {
    return c.json({ error: controlTowerUnauthorizedMessage() }, 401);
  }
  await next();
});

adminSpendRoute.get('/', async (c) => {
  const periodDays = Number(c.req.query('days') ?? 7);
  const summary = await buildSpendSummary(periodDays);
  return c.json(summary);
});
