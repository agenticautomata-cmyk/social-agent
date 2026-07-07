import { Hono } from 'hono';
import { listRecentDiscountDeals, seedDiscountWatchSources } from '@social-agent/core/discount-watch';

export const discountWatchRoute = new Hono();

discountWatchRoute.get('/recent', async (c) => {
  const limit = Number.parseInt(c.req.query('limit') ?? '30', 10);
  const deals = await listRecentDiscountDeals(Number.isFinite(limit) ? limit : 30);
  return c.json({ ok: true, count: deals.length, deals });
});

discountWatchRoute.post('/seed', async (c) => {
  const result = await seedDiscountWatchSources();
  return c.json({ ok: true, ...result });
});
