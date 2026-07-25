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
import {
  getCreatorFieldStatus,
  setCreatorFieldStatus,
  type CreatorFieldStatus,
} from '@social-agent/core/creator-field-status';

export const preferencesRoute = new Hono();

preferencesRoute.get('/', async (c) => {
  const [preferences, liveFieldStatus] = await Promise.all([
    getCreatorPreferences(),
    getCreatorFieldStatus(),
  ]);
  return c.json({ ok: true, preferences, liveFieldStatus });
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

const FieldStatusSchema = z.object({
  active: z.boolean(),
  headline: z.string().min(1).max(200),
  eventName: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activity: z.string().min(1).max(200),
  expiresAt: z.string().datetime().optional(),
});

preferencesRoute.put('/field-status', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = FieldStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid field status payload' }, 400);
  }

  const now = new Date();
  const expiresAt =
    parsed.data.expiresAt ??
    new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString();

  const status: CreatorFieldStatus = {
    ...parsed.data,
    updatedAt: now.toISOString(),
    expiresAt,
  };

  const liveFieldStatus = await setCreatorFieldStatus(parsed.data.active ? status : null);
  return c.json({ ok: true, liveFieldStatus });
});
