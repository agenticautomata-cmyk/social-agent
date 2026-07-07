import { Hono } from 'hono';
import {
  buildPublicWebsitePayload,
  canServePublicMedia,
  readWebsiteMediaFile,
} from '@social-agent/core/website-manager';

export const publicWebsiteRoute = new Hono();

const CACHE_SECONDS = 60;

publicWebsiteRoute.get('/', async (c) => {
  const payload = await buildPublicWebsitePayload();
  c.header('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=120`);
  return c.json({ ok: true, ...payload });
});

publicWebsiteRoute.get('/media/:filename', async (c) => {
  const filename = c.req.param('filename');
  const allowed = await canServePublicMedia(filename);
  if (!allowed) return c.json({ error: 'not found' }, 404);

  const file = await readWebsiteMediaFile(filename);
  if (!file) return c.json({ error: 'not found' }, 404);

  return new Response(file.buffer, {
    headers: {
      'Content-Type': file.mimeType,
      'Cache-Control': `public, max-age=${CACHE_SECONDS * 10}`,
    },
  });
});
