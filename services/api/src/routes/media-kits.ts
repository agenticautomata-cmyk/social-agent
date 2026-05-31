import { Hono } from 'hono';
import { z } from 'zod';
import {
  listMediaKits,
  getMediaKit,
  createMediaKit,
  updateMediaKit,
} from '@social-agent/core/sponsor-outreach';

export const mediaKitsRoute = new Hono();

mediaKitsRoute.get('/', async (c) => {
  const activeOnly = c.req.query('active') === 'true';
  const kits = await listMediaKits(activeOnly);
  return c.json({ kits });
});

mediaKitsRoute.get('/:id', async (c) => {
  const kit = await getMediaKit(c.req.param('id'));
  if (!kit) return c.json({ error: 'not found' }, 404);
  return c.json({ kit });
});

const MediaKitSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  targetAudience: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  version: z.string().optional(),
  active: z.boolean().optional(),
});

mediaKitsRoute.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = MediaKitSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const kit = await createMediaKit(parsed.data);
  return c.json({ kit }, 201);
});

mediaKitsRoute.put('/:id', async (c) => {
  const body = await c.req.json();
  const parsed = MediaKitSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const kit = await updateMediaKit(c.req.param('id'), parsed.data);
  if (!kit) return c.json({ error: 'not found' }, 404);
  return c.json({ kit });
});
