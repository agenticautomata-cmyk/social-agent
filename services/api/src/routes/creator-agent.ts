import { Hono } from 'hono';
import { z } from 'zod';
import {
  createEntitySuppression,
  listEntitySuppressions,
  restoreEntitySuppression,
  searchCreatorInventory,
  runCreatorAgentCleanup,
} from '@social-agent/core/creator-agent';
import { listHiddenByBenson, restoreHiddenByBenson } from '@social-agent/core/suppression-audit';

export const creatorAgentRoute = new Hono();

creatorAgentRoute.get('/search', async (c) => {
  const query = c.req.query('q') ?? '';
  const category = c.req.query('category');
  const includeArchived = c.req.query('includeArchived') === 'true';
  const limit = Number(c.req.query('limit') ?? '20');
  const result = await searchCreatorInventory({
    query,
    category: category ?? undefined,
    includeArchived,
    limit: Number.isFinite(limit) ? limit : 20,
  });
  return c.json({ ok: true, ...result, calculatedAt: new Date().toISOString() });
});

creatorAgentRoute.get('/suppressions', async (c) => {
  const rows = await listEntitySuppressions(200);
  return c.json({ ok: true, suppressions: rows, calculatedAt: new Date().toISOString() });
});

creatorAgentRoute.post('/suppressions', async (c) => {
  const body = z
    .object({
      canonicalName: z.string().min(1),
      aliases: z.array(z.string()).optional(),
      domains: z.array(z.string()).optional(),
      suppressionReason: z.string().min(1),
      permanent: z.boolean().optional(),
    })
    .parse(await c.req.json());
  const id = await createEntitySuppression(body);
  return c.json({ ok: true, id });
});

creatorAgentRoute.post('/suppressions/:id/restore', async (c) => {
  await restoreEntitySuppression(c.req.param('id'));
  return c.json({ ok: true });
});

creatorAgentRoute.get('/hidden', async (c) => {
  const rows = await listHiddenByBenson(200);
  return c.json({ ok: true, rows, calculatedAt: new Date().toISOString() });
});

creatorAgentRoute.post('/hidden/:category/:id/restore', async (c) => {
  const category = c.req.param('category') as Parameters<typeof restoreHiddenByBenson>[0];
  const result = await restoreHiddenByBenson(category, c.req.param('id'));
  return c.json(result, result.ok ? 200 : 400);
});

creatorAgentRoute.post('/cleanup', async (c) => {
  const report = await runCreatorAgentCleanup();
  return c.json({ ok: true, report });
});

creatorAgentRoute.post('/audit-drafts', async (c) => {
  const archive = c.req.query('archive') === 'true';
  const { auditExistingDrafts, summarizeDraftAudit } = await import('@social-agent/core/content-angles');
  const report = await auditExistingDrafts({ archiveInvalid: archive });
  return c.json({ ok: true, report: summarizeDraftAudit(report), items: report.items.slice(0, 50) });
});

creatorAgentRoute.post('/regenerate-corrected-drafts', async (c) => {
  const { regenerateCorrectedOutreachDrafts } = await import('@social-agent/core/content-angles');
  const report = await regenerateCorrectedOutreachDrafts();
  return c.json({ ok: true, report });
});
