import { Hono } from 'hono';
import {
  getLatestLearnings,
  isBensonLearningUiEnabled,
  regenerateCleanLearnings,
  runBensonLearningCycle,
} from '@social-agent/core/benson-learning';
import { classifyError, sanitizeErrorForUi } from '@social-agent/core/provider-errors';

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
    const classified = classifyError(err, 'openai');
    console.error(
      `[benson-learning/run] failed (${classified.rootCause}${classified.requestId ? `, ${classified.requestId}` : ''}): ${classified.logMessage}`,
    );
    return c.json({ ok: false, error: sanitizeErrorForUi(err, 'learning') }, 500);
  }
});

bensonLearningRoute.post('/regenerate-clean', async (c) => {
  try {
    const result = await regenerateCleanLearnings();
    const learning = await getLatestLearnings();
    return c.json({ ok: true, result, uiEnabled: isBensonLearningUiEnabled(), learning });
  } catch (err) {
    const classified = classifyError(err, 'openai');
    console.error(
      `[benson-learning/regenerate] failed (${classified.rootCause}${classified.requestId ? `, ${classified.requestId}` : ''}): ${classified.logMessage}`,
    );
    return c.json({ ok: false, error: sanitizeErrorForUi(err, 'learning') }, 500);
  }
});
