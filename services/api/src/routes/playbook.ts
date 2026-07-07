import { Hono } from 'hono';
import { z } from 'zod';
import {
  listPlaybookSources,
  listPlaybookQuickActions,
  listPlaybookChecklists,
  getPlaybookChecklistBySlug,
  askPlaybookCoach,
  ingestPlaybookSources,
  SCRIPT_FORMATS,
  type PlaybookCapability,
} from '@social-agent/core/tiktok-playbook';

export const playbookRoute = new Hono();

playbookRoute.get('/', async (c) => {
  const [sources, quickActions] = await Promise.all([
    listPlaybookSources(),
    listPlaybookQuickActions(),
  ]);
  return c.json({ ok: true, sources, quickActions, category: 'TikTok Creator Playbook' });
});

playbookRoute.get('/sources', async (c) => {
  const sources = await listPlaybookSources();
  return c.json({ ok: true, sources });
});

playbookRoute.get('/checklists', async (c) => {
  const checklists = await listPlaybookChecklists();
  return c.json({ ok: true, checklists });
});

playbookRoute.get('/checklists/:slug', async (c) => {
  const checklist = await getPlaybookChecklistBySlug(c.req.param('slug'));
  if (!checklist) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true, checklist });
});

playbookRoute.post('/ingest', async (c) => {
  try {
    const result = await ingestPlaybookSources();
    const sources = await listPlaybookSources();
    return c.json({ ok: result.ok, result, sources });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingest failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

playbookRoute.post('/ask', async (c) => {
  try {
    const body = z
      .object({
        question: z.string().max(8000),
        capability: z.string().optional(),
        sourceSlug: z.string().nullable().optional(),
        scriptFormat: z.enum(SCRIPT_FORMATS).nullable().optional(),
        imageDataUrl: z.string().nullable().optional(),
      })
      .parse(await c.req.json());

    if (!body.question.trim() && !body.imageDataUrl) {
      return c.json({ ok: false, error: 'Question or screenshot required' }, 400);
    }

    const response = await askPlaybookCoach({
      question: body.question,
      capability: body.capability as PlaybookCapability | undefined,
      sourceSlug: body.sourceSlug,
      scriptFormat: body.scriptFormat ?? null,
      imageDataUrl: body.imageDataUrl,
    });
    return c.json({ ok: true, ...response });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ask failed';
    return c.json({ ok: false, error: message }, 400);
  }
});
