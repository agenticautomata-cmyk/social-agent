import { Hono } from 'hono';
import { featureFlags } from '@social-agent/core/feature-flags';
import { env } from '@social-agent/core';
import {
  getIngestionFreshnessSummary,
  listDurableItemsForSource,
  listIngestionRuns,
  listSourceRegistry,
  refreshAllSources,
  refreshOneSource,
  setSourceMutePolicy,
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

/** Durable inventory for one source — Source Refresh item inspection only. */
sourcesRoute.get('/:id/items', async (c) => {
  const sourceId = c.req.param('id');
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
  try {
    const result = await listDurableItemsForSource(sourceId, {
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return c.json({
      ok: true,
      demoMode: env.DEMO_MODE,
      sourceId: result.sourceId,
      sourceName: result.sourceName,
      count: result.count,
      items: result.items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
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

sourcesRoute.post('/:id/mute', async (c) => {
  const sourceId = c.req.param('id');
  try {
    const updated = await setSourceMutePolicy(sourceId, 'always_ignore', 'dashboard');
    return c.json({ ok: true, sourceId: updated.id, mutePolicy: 'always_ignore' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

sourcesRoute.post('/:id/unmute', async (c) => {
  const sourceId = c.req.param('id');
  try {
    const updated = await setSourceMutePolicy(sourceId, 'none', 'dashboard');
    return c.json({ ok: true, sourceId: updated.id, mutePolicy: 'none' });
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
