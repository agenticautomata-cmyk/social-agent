// Manual scanner trigger — dashboard "Scan now" / Benson ingest.

import { Hono } from 'hono';
import { scanAllActiveSources } from '@social-agent/core/scanner';
import { featureFlags } from '@social-agent/core/feature-flags';

export const scannerRoute = new Hono();

scannerRoute.post('/run', async (c) => {
  if (!featureFlags.enableKcScanner) {
    return c.json({ error: 'ENABLE_KC_SCANNER is not enabled' }, 404);
  }

  const campaignId = c.req.query('campaignId');
  const sourceId = c.req.query('sourceId');

  try {
    const result = await scanAllActiveSources({
      campaignId: campaignId ?? undefined,
      sourceId: sourceId ?? undefined,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

scannerRoute.get('/runs', async (c) => {
  if (!featureFlags.enableKcScanner) {
    return c.json({ error: 'ENABLE_KC_SCANNER is not enabled' }, 404);
  }
  const { db, scanRuns, sources } = await import('@social-agent/core');
  const { desc, eq } = await import('drizzle-orm');
  const sourceId = c.req.query('sourceId');
  const rows = await db
    .select({
      run: scanRuns,
      sourceName: sources.name,
    })
    .from(scanRuns)
    .leftJoin(sources, eq(sources.id, scanRuns.sourceId))
    .where(sourceId ? eq(scanRuns.sourceId, sourceId) : undefined)
    .orderBy(desc(scanRuns.startedAt))
    .limit(50);
  return c.json({ runs: rows });
});
