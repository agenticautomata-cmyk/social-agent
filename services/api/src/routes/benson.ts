import { Hono } from 'hono';
import { env } from '@social-agent/core';
import { computeBensonHub } from '@social-agent/core/benson-intelligence';
import {
  loadFilteredIngestedInventory,
  parseExcludeCategoriesQuery,
} from '../lib/inventory-query.js';

export const bensonRoute = new Hono();

bensonRoute.get('/', async (c) => {
  const excludeCategories = parseExcludeCategoriesQuery(c.req.query('excludeCategories'));
  const items = await loadFilteredIngestedInventory(excludeCategories);
  const hub = await computeBensonHub(items, { demoMode: env.DEMO_MODE });
  return c.json(hub);
});
