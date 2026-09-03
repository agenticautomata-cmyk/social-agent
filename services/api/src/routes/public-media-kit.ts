import { Hono } from 'hono';
import { loadMediaKitBySlug, renderMediaKitHtml } from '@social-agent/core/media-kit';

/**
 * Public read-only access to a generated media kit.
 *
 * Deliberately unauthenticated: the link goes out in a pitch, so the recipient is a
 * hotel's marketing manager with no Benson account. Only generated kits are reachable,
 * and only by slug — uploaded files and the test artifacts are not served here.
 */
export const publicMediaKitRoute = new Hono();

const CACHE_SECONDS = 300;

publicMediaKitRoute.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return c.json({ error: 'not found' }, 404);

  const kit = await loadMediaKitBySlug(slug);
  if (!kit) return c.json({ error: 'not found' }, 404);

  c.header('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`);
  return c.json({ ok: true, id: kit.id, name: kit.name, generatedAt: kit.generatedAt, content: kit.content });
});

/** The rendered page, for the link that goes out in a pitch. */
publicMediaKitRoute.get('/:slug/view', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return c.text('Not found', 404);

  const kit = await loadMediaKitBySlug(slug);
  if (!kit) return c.text('Not found', 404);

  return new Response(renderMediaKitHtml(kit.content), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
      // The kit is for the recipient, not for search engines.
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
});
