import { Hono } from 'hono';
import { z } from 'zod';
import {
  createWatchedSource,
  deleteWatchlistSource,
  getWatchlistItem,
  inspectSubmittedUrl,
  listScoutItemsForWatcher,
  listWatchlist,
  listWatcherRuns,
  pauseWatchlistSource,
  runWatcherNow,
  scoutHealthSummary,
} from '@social-agent/core/benson-scout';
import {
  dismissCuratorLead,
  getCuratorSourceHealth,
  listCuratorLeads,
  reprocessLatestCuratorPost,
} from '@social-agent/core/curator-watchlist';

export const watchlistRoute = new Hono();

watchlistRoute.get('/', async (c) => {
  const items = await listWatchlist();
  return c.json({ ok: true, items });
});

watchlistRoute.get('/:id', async (c) => {
  const item = await getWatchlistItem(c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Not found' }, 404);
  const scoutItems = await listScoutItemsForWatcher(item.id);
  const curatorLeads = await listCuratorLeads({ watcherId: item.id, limit: 50 });
  const curatorHealth = await getCuratorSourceHealth(item.id);
  const runHistory = await listWatcherRuns(item.id, 10);
  return c.json({ ok: true, item, scoutItems, curatorLeads, curatorHealth, runHistory });
});

const InspectSchema = z.object({ url: z.string().url().max(2000) });

watchlistRoute.post('/inspect', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = InspectSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Valid url required' }, 400);
  try {
    const inspect = inspectSubmittedUrl(parsed.data.url);
    return c.json({ ok: true, inspect });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'Inspect failed' }, 400);
  }
});

const CreateSchema = z.object({
  url: z.string().url().max(2000),
  monitoringMode: z.enum([
    'SINGLE_ITEM',
    'WATCH_PAGE',
    'WATCH_PUBLISHER',
    'WATCH_ACCOUNT',
    'WATCH_FEED',
    'WATCH_DOCUMENT_INDEX',
  ]),
  sourceName: z.string().max(200).optional(),
  processOnly: z.boolean().optional(),
});

watchlistRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Invalid watchlist payload' }, 400);
  try {
    const result = await createWatchedSource(parsed.data);
    return c.json({
      ok: true,
      ...result,
      message: result.alreadyWatching ? 'Already watching this source.' : undefined,
    });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'Create failed' }, 400);
  }
});

watchlistRoute.post('/:id/check-now', async (c) => {
  const result = await runWatcherNow(c.req.param('id'));
  return c.json(result, result.ok ? 200 : 400);
});

watchlistRoute.post('/:id/reprocess-latest', async (c) => {
  const result = await reprocessLatestCuratorPost(c.req.param('id'));
  return c.json(result, result.ok ? 200 : 400);
});

watchlistRoute.post('/:id/pause', async (c) => {
  const body = await c.req.json().catch(() => ({ paused: true }));
  const paused = Boolean((body as { paused?: boolean }).paused ?? true);
  const ok = await pauseWatchlistSource(c.req.param('id'), paused);
  return c.json({ ok });
});

watchlistRoute.delete('/:id', async (c) => {
  const ok = await deleteWatchlistSource(c.req.param('id'));
  return c.json({ ok }, ok ? 200 : 404);
});

watchlistRoute.get('/:id/leads', async (c) => {
  const leads = await listCuratorLeads({ watcherId: c.req.param('id'), limit: 100 });
  return c.json({ ok: true, leads });
});

watchlistRoute.post('/leads/:leadId/dismiss', async (c) => {
  const body = await c.req.json().catch(() => ({ reason: 'dismissed' }));
  const reason = String((body as { reason?: string }).reason ?? 'dismissed');
  const ok = await dismissCuratorLead(c.req.param('leadId'), reason);
  return c.json({ ok }, ok ? 200 : 404);
});

export const scoutAdminRoute = new Hono();

scoutAdminRoute.get('/health', async (c) => {
  const summary = await scoutHealthSummary();
  return c.json({
    ok: true,
    summary,
    adr: 'docs/scout-expansion-adr.md',
    pinned: {
      crawlee: 'v3.17.0',
      playwright: 'v1.61.1',
      agentBrowser: 'v0.33.0',
      promptfoo: '0.121.19',
    },
  });
});
