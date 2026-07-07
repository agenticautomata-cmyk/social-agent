import { Hono } from 'hono';
import { listZeroItemSources } from '@social-agent/core/source-ingestion';

export const reportsRoute = new Hono();

reportsRoute.get('/zero-item-sources', async (c) => {
  const sources = await listZeroItemSources();
  return c.json({
    ok: true,
    count: sources.length,
    sources,
  });
});
