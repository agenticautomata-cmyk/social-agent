import { Hono } from 'hono';
import {
  getLatestLearnings,
  isBensonLearningUiEnabled,
  regenerateCleanLearnings,
  runBensonLearningCycle,
} from '@social-agent/core/benson-learning';

export const bensonLearningRoute = new Hono();

bensonLearningRoute.get('/latest', async (c) => {
  const learning = await getLatestLearnings();
  return c.json({
    ok: true,
    uiEnabled: isBensonLearningUiEnabled(),
    learning,
  });
});

bensonLearningRoute.post('/run', async (c) => {
  try {
    const result = await runBensonLearningCycle();
    const learning = await getLatestLearnings();
    return c.json({ ok: true, result, uiEnabled: isBensonLearningUiEnabled(), learning });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});

bensonLearningRoute.post('/regenerate-clean', async (c) => {
  try {
    const result = await regenerateCleanLearnings();
    const learning = await getLatestLearnings();
    return c.json({ ok: true, result, uiEnabled: isBensonLearningUiEnabled(), learning });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});
