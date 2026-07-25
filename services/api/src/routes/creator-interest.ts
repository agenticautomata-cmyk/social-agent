import { Hono } from 'hono';
import { z } from 'zod';
import {
  addToToday,
  expressCreatorInterest,
  getDiscoveryRecord,
  listBensonDiscoverySources,
  retryResearchJob,
  runResearchJob,
  generateAssistancePackage,
  runBusinessEnrichment,
} from '@social-agent/core/creator-interest';
import { INTEREST_ACTIONS } from '@social-agent/core/creator-interest/types';

export const creatorInterestRoute = new Hono();

creatorInterestRoute.get('/discoveries', async (c) => {
  const discoveries = await listBensonDiscoverySources();
  return c.json({ ok: true, discoveries });
});

creatorInterestRoute.get('/records/:contentItemId', async (c) => {
  const record = await getDiscoveryRecord(c.req.param('contentItemId'));
  if (!record) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, record });
});

const ActionSchema = z.object({
  action: z.enum(INTEREST_ACTIONS),
  sourceScreen: z.string().default('unknown'),
  requestedAssistance: z.array(z.string()).optional(),
});

creatorInterestRoute.post('/records/:contentItemId/interest', async (c) => {
  try {
    const body = ActionSchema.parse(await c.req.json());
    const result = await expressCreatorInterest({
      contentItemId: c.req.param('contentItemId'),
      action: body.action,
      sourceScreen: body.sourceScreen,
      requestedAssistance: body.requestedAssistance,
    });
    const record = await getDiscoveryRecord(result.contentItemId);
    return c.json({ ok: true, result, record });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

creatorInterestRoute.post('/records/:contentItemId/add-to-today', async (c) => {
  await addToToday(c.req.param('contentItemId'));
  return c.json({ ok: true });
});

creatorInterestRoute.post('/research/:jobId/retry', async (c) => {
  try {
    await retryResearchJob(c.req.param('jobId'));
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

creatorInterestRoute.post('/research/:jobId/run', async (c) => {
  await runResearchJob(c.req.param('jobId'));
  return c.json({ ok: true });
});

creatorInterestRoute.post('/records/:contentItemId/regenerate-package', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const record = await getDiscoveryRecord(contentItemId);
  if (!record?.enrichment) return c.json({ ok: false, error: 'enrichment_required' }, 400);
  const enrichment = await runBusinessEnrichment(contentItemId);
  const pkg = await generateAssistancePackage({
    title: record.title,
    summary: record.summary,
    enrichment,
    category: record.category,
  });
  return c.json({ ok: true, assistancePackage: pkg });
});
