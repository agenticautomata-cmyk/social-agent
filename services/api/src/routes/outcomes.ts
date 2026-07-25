import { Hono } from 'hono';
import {
  backfillHistoricalLinks,
  buildOutcomeAnalyticsSummary,
  getOutcomeCardSummary,
  listOutcomeLinks,
  recordRecommendationEvent,
  recordRecommendationResponse,
  shootsWithoutPosts,
} from '@social-agent/core/outcome-engine';
import { buildSpendOutcomeMetrics } from '@social-agent/core/llm-spend';

export const outcomesRoute = new Hono();

outcomesRoute.get('/summary', async (c) => {
  const lookbackDays = Number(c.req.query('days') ?? 90);
  const spendPeriodDays = Math.min(lookbackDays, 7);
  const [summary, spendMetrics] = await Promise.all([
    buildOutcomeAnalyticsSummary(lookbackDays),
    buildSpendOutcomeMetrics(spendPeriodDays).catch(() => null),
  ]);
  return c.json({ ...summary, spendMetrics });
});

outcomesRoute.get('/cards', async (c) => {
  const cards = await getOutcomeCardSummary();
  return c.json(cards);
});

outcomesRoute.get('/links', async (c) => {
  const limit = Number(c.req.query('limit') ?? 50);
  const rows = await listOutcomeLinks(limit);
  return c.json({
    items: rows.map((r) => ({
      ...r.link,
      title: r.title,
      linkConfidence: r.link.linkConfidence ? Number(r.link.linkConfidence) : 1,
      outcomeScore: r.link.outcomeScore ? Number(r.link.outcomeScore) : null,
    })),
  });
});

outcomesRoute.get('/shoots-without-posts', async (c) => {
  const rows = await shootsWithoutPosts(30);
  return c.json({
    items: rows.map((r) => ({
      shootId: r.shoot.id,
      title: r.title,
      status: r.shoot.status,
      endedAt: r.shoot.endedAt?.toISOString() ?? null,
    })),
  });
});

outcomesRoute.post('/recommendations', async (c) => {
  const body = await c.req.json();
  const row = await recordRecommendationEvent(body);
  return c.json(row, 201);
});

outcomesRoute.post('/recommendations/:id/response', async (c) => {
  const body = await c.req.json();
  const row = await recordRecommendationResponse(c.req.param('id'), body.response, body.reason);
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

outcomesRoute.post('/backfill', async (c) => {
  const result = await backfillHistoricalLinks(250);
  return c.json(result);
});
