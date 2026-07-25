import { Hono } from 'hono';
import {
  advanceShootShot,
  finishShootSession,
  getActiveShootSession,
  getShootSessionView,
  listRecentShootSessions,
  searchShootOpportunities,
  startShootSession,
  syncShootSession,
} from '@social-agent/core/shoot-mode';

export const shootRoute = new Hono();

shootRoute.get('/active', async (c) => {
  const active = await getActiveShootSession();
  if (!active) return c.json({ active: null });
  const view = await getShootSessionView(active.id);
  return c.json({ active: view });
});

shootRoute.get('/sessions', async (c) => {
  const rows = await listRecentShootSessions(20);
  return c.json({
    items: rows.map((r) => ({
      id: r.session.id,
      title: r.title,
      sponsorName: r.sponsorName,
      status: r.session.status,
      startedAt: r.session.startedAt.toISOString(),
      endedAt: r.session.endedAt?.toISOString() ?? null,
    })),
  });
});

shootRoute.get('/opportunities/search', async (c) => {
  const q = c.req.query('q') ?? '';
  const items = await searchShootOpportunities(q, 15);
  return c.json({ items });
});

shootRoute.get('/sessions/:id', async (c) => {
  const view = await getShootSessionView(c.req.param('id'));
  if (!view) return c.json({ error: 'Not found' }, 404);
  return c.json(view);
});

shootRoute.post('/sessions/start', async (c) => {
  const body = await c.req.json();
  const result = await startShootSession(body);
  const view = await getShootSessionView(result.session!.id);
  return c.json({ ...result, view }, result.resumed ? 200 : 201);
});

shootRoute.patch('/sessions/:id', async (c) => {
  const body = await c.req.json();
  const row = await syncShootSession(c.req.param('id'), body);
  if (!row) return c.json({ error: 'Active session not found' }, 404);
  const view = await getShootSessionView(row.id);
  return c.json(view);
});

shootRoute.post('/sessions/:id/advance', async (c) => {
  const body = await c.req.json();
  const row = await advanceShootShot(c.req.param('id'), body.action ?? 'next');
  if (!row) return c.json({ error: 'Active session not found' }, 404);
  const view = await getShootSessionView(row.id);
  return c.json(view);
});

shootRoute.post('/sessions/:id/finish', async (c) => {
  const body = await c.req.json();
  const row = await finishShootSession(c.req.param('id'), body.reason, body.note);
  if (!row) return c.json({ error: 'Not found' }, 404);
  const view = await getShootSessionView(row.id);
  return c.json(view);
});
