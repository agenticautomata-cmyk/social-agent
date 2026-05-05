// Workflow runs — orchestration audit log.

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db, workflowRuns } from '@social-agent/core';

export const runsRoute = new Hono();

runsRoute.get('/', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 500);
  const itemId = c.req.query('contentItemId');

  const rows = await db
    .select()
    .from(workflowRuns)
    .where(itemId ? eq(workflowRuns.contentItemId, itemId) : undefined)
    .orderBy(desc(workflowRuns.startedAt))
    .limit(limit);

  return c.json({ runs: rows });
});
