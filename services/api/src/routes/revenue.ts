import { Hono } from 'hono';
import { env } from '@social-agent/core';
import { computeRevenueDashboard } from '@social-agent/core/revenue-dashboard';

export const revenueRoute = new Hono();

revenueRoute.get('/', async (c) => {
  const dashboard = await computeRevenueDashboard({ demoMode: env.DEMO_MODE });
  return c.json(dashboard);
});
