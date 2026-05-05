// Manual planner trigger — useful for the dashboard's "Plan now" button.

import { Hono } from 'hono';
import { planner } from '@social-agent/core';

export const plannerRoute = new Hono();

plannerRoute.post('/run', async (c) => {
  const campaignId = c.req.query('campaignId');
  if (!campaignId) {
    const results = await planner.planAllActiveCampaigns();
    return c.json({ results });
  }
  const result = await planner.planUpcomingWeek(campaignId);
  return c.json({ result });
});
