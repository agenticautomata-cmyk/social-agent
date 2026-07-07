// Creator preferences — server-side learned preferences (category exclusions).
// Synced by the dashboard category filter bar and updated by Benson chat.

import { Hono } from 'hono';
import { z } from 'zod';
import {
  applyPreferenceUpdates,
  getCreatorPreferences,
  listKnownCategories,
  setExcludedCategories,
} from '@social-agent/core/creator-preferences';

export const preferencesRoute = new Hono();

preferencesRoute.get('/', async (c) => {
  const preferences = await getCreatorPreferences();
  return c.json({ ok: true, preferences });
});

preferencesRoute.get('/categories', async (c) => {
  const categories = await listKnownCategories();
  return c.json({ ok: true, categories });
});

const PutSchema = z.object({
  excludedCategories: z.array(z.string()).max(100),
});

preferencesRoute.put('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'excludedCategories: string[] is required' }, 400);
  }
  const preferences = await setExcludedCategories(parsed.data.excludedCategories, 'dashboard');
  return c.json({ ok: true, preferences });
});

const UpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        action: z.enum(['exclude', 'include']),
        category: z.string().min(1).max(80),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});

preferencesRoute.post('/updates', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'updates: [{action, category, note?}] is required' }, 400);
  }
  const result = await applyPreferenceUpdates(parsed.data.updates, 'api');
  return c.json({ ok: true, applied: result.applied, preferences: result.preferences });
});
