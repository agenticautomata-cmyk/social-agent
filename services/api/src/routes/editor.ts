import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import { upsertTracking } from '@social-agent/core/editor';
import { computeBensonEditorHome } from '@social-agent/core/benson-intelligence';
import { computeInventoryStats, loadIngestedInventoryItems } from '@social-agent/core/inventory';
import {
  loadFilteredIngestedInventory,
  parseExcludeCategoriesQuery,
} from '../lib/inventory-query.js';

export const editorRoute = new Hono();

editorRoute.get('/', async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 6, 1), 20) : 6;

  const excludeCategories = parseExcludeCategoriesQuery(c.req.query('excludeCategories'));
  const [allItems, items] = await Promise.all([
    loadIngestedInventoryItems(),
    loadFilteredIngestedInventory(excludeCategories),
  ]);
  const home = await computeBensonEditorHome(items, { limit, demoMode: env.DEMO_MODE });
  const categoryOptions = computeInventoryStats(allItems).byCategory;

  return c.json({ ...home, categoryOptions });
});

const TrackingUpdateSchema = z.object({
  saved: z.boolean().optional(),
  covered: z.boolean().optional(),
  note: z.string().nullable().optional(),
  followUpAt: z.string().nullable().optional(),
});

editorRoute.put('/tracking/:contentItemId', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const body = await c.req.json();
  const parsed = TrackingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const record = await upsertTracking(contentItemId, parsed.data);
  return c.json({ ok: true, tracking: record });
});
