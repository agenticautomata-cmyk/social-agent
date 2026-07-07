import { Hono } from 'hono';
import { getLatestDiscovery, runBensonLocalDiscovery } from '@social-agent/core/benson-discovery';

export const bensonDiscoveryRoute = new Hono();

bensonDiscoveryRoute.get('/latest', async (c) => {
  const discovery = await getLatestDiscovery();
  return c.json({ ok: true, discovery });
});

bensonDiscoveryRoute.post('/run', async (c) => {
  try {
    const result = await runBensonLocalDiscovery();
    return c.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});
