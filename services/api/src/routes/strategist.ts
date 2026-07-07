import { Hono } from 'hono';
import {
  analyzeStrategistBriefing,
  getStrategistBriefing,
} from '@social-agent/core/strategist';

export const strategistRoute = new Hono();

strategistRoute.get('/briefing', async (c) => {
  try {
    const briefing = await getStrategistBriefing();
    return c.json(briefing);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load strategist briefing';
    return c.json({ ok: false, error: message }, 500);
  }
});

strategistRoute.post('/analyze', async (c) => {
  try {
    const briefing = await analyzeStrategistBriefing();
    return c.json(briefing);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Strategist analysis failed';
    const status = message.includes('OPENAI_API_KEY') || message.includes('API key') ? 503 : 500;
    return c.json({ ok: false, error: message }, status);
  }
});
