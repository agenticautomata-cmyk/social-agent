import { Hono } from 'hono';
import { featureFlags } from '@social-agent/core/feature-flags';
import { env } from '@social-agent/core';
import {
  getIngestionFreshnessSummary,
  listIngestionRuns,
  listSourceRegistry,
  refreshAllSources,
  refreshOneSource,
} from '@social-agent/core/source-ingestion';

export const sourcesRoute = new Hono();

sourcesRoute.get('/freshness', async (c) => {
  const demoMode = env.DEMO_MODE;
  const summary = await getIngestionFreshnessSummary(demoMode);
  return c.json({ ok: true, freshness: summary });
});

sourcesRoute.get('/', async (c) => {
  const sources = await listSourceRegistry();
  const scannerEnabled = featureFlags.enableKcScanner;
  const demoMode = env.DEMO_MODE;
  return c.json({
    ok: true,
    demoMode,
    scannerEnabled,
    count: sources.length,
    enabledCount: sources.filter((s) => s.enabled).length,
    sources,
  });
});

sourcesRoute.get('/runs', async (c) => {
  const sourceId = c.req.query('sourceId');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const runs = await listIngestionRuns({ sourceId: sourceId ?? undefined, limit });
  return c.json({ ok: true, runs });
});

sourcesRoute.post('/:id/refresh', async (c) => {
  if (!featureFlags.enableKcScanner) {
    return c.json({ error: 'ENABLE_KC_SCANNER is not enabled' }, 404);
  }
  const sourceId = c.req.param('id');
  const dryRun = c.req.query('dry_run') === 'true';
  try {
    const result = await refreshOneSource(sourceId, { dryRun });
    return c.json({ ok: result.status !== 'failed', result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

sourcesRoute.post('/refresh-all', async (c) => {
  if (!featureFlags.enableKcScanner) {
    return c.json({ error: 'ENABLE_KC_SCANNER is not enabled' }, 404);
  }
  const dryRun = c.req.query('dry_run') === 'true';
  const campaignId = c.req.query('campaignId');
  try {
    const result = await refreshAllSources({ dryRun, campaignId: campaignId ?? undefined });
    return c.json({ ok: result.totals.failed === 0, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});
