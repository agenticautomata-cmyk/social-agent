import { Hono } from 'hono';
import { getCreatorInboxConfig } from '@social-agent/core/creator-info';

export const creatorInfoRoute = new Hono();

creatorInfoRoute.get('/channels', (c) => {
  return c.json({ ok: true, ...getCreatorInboxConfig() });
});
