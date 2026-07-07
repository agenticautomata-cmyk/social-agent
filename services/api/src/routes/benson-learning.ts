import { Hono } from 'hono';
import { getLatestLearnings, runBensonLearningCycle } from '@social-agent/core/benson-learning';

export const bensonLearningRoute = new Hono();

bensonLearningRoute.get('/latest', async (c) => {
  const learning = await getLatestLearnings();
  return c.json({ ok: true, learning });
});

bensonLearningRoute.post('/run', async (c) => {
  try {
    const result = await runBensonLearningCycle();
    const learning = await getLatestLearnings();
    return c.json({ ok: true, result, learning });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});
