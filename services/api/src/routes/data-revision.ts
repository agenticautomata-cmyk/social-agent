import { Hono } from 'hono';
import { z } from 'zod';
import {
  getDataRevisionStatus,
  emitDataChange,
  type DataRevisionDomain,
} from '@social-agent/core/data-revision';
import {
  skipDiscoveryRecord,
  restoreSkippedRecord,
  listSkippedHistory,
  type SkipSourceScreen,
  type SnoozePreset,
} from '@social-agent/core/creator-skip';

export const dataRevisionRoute = new Hono();

dataRevisionRoute.get('/status', async (c) => {
  const status = await getDataRevisionStatus();
  return c.json({ ok: true, ...status });
});

const skipBodySchema = z.object({
  sourceScreen: z.string().optional(),
  snoozePreset: z
    .enum(['later_today', 'tomorrow', 'this_weekend', 'next_week'])
    .optional(),
  snoozeUntil: z.string().datetime().optional(),
});

dataRevisionRoute.post('/skip/:contentItemId', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const body = skipBodySchema.parse(await c.req.json().catch(() => ({})));
  try {
    const result = await skipDiscoveryRecord({
      contentItemId,
      sourceScreen: (body.sourceScreen ?? 'unknown') as SkipSourceScreen,
      snoozePreset: body.snoozePreset as SnoozePreset | undefined,
      snoozeUntil: body.snoozeUntil ? new Date(body.snoozeUntil) : undefined,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Skip failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

dataRevisionRoute.post('/skip/:contentItemId/restore', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const body = (await c.req.json().catch(() => ({}))) as { fingerprint?: string };
  await restoreSkippedRecord(contentItemId, body.fingerprint);
  return c.json({ ok: true });
});

dataRevisionRoute.get('/skip/history', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const history = await listSkippedHistory(limit);
  return c.json({ ok: true, history });
});

/** Internal helper for same-process clients to broadcast a change after local mutation. */
dataRevisionRoute.post('/notify', async (c) => {
  const body = (await c.req.json()) as {
    eventType?: string;
    domains?: DataRevisionDomain[];
    source?: string;
    recordIds?: string[];
    success?: boolean;
  };
  if (!body.eventType || !body.domains?.length || !body.source) {
    return c.json({ error: 'eventType, domains, and source required' }, 400);
  }
  const revisions = await emitDataChange({
    eventType: body.eventType as never,
    domains: body.domains,
    completedAt: new Date().toISOString(),
    source: body.source,
    recordIds: body.recordIds,
    success: body.success !== false,
  });
  return c.json({ ok: true, revisions });
});
