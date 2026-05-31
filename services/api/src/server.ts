import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { featureFlags } from '@social-agent/core/feature-flags';

import { campaignsRoute } from './routes/campaigns.js';
import { contentRoute } from './routes/content.js';
import { opportunitiesRoute } from './routes/opportunities.js';
import { approvalsRoute } from './routes/approvals.js';
import { runsRoute } from './routes/runs.js';
import { metricsRoute } from './routes/metrics.js';
import { plannerRoute } from './routes/planner.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: '*' }));

app.get('/health', (c) => c.json({ ok: true }));

app.route('/api/campaigns', campaignsRoute);
app.route('/api/content', contentRoute);
if (featureFlags.enableOpportunitiesApi) {
  app.route('/api/opportunities', opportunitiesRoute);
  console.log('[api] ENABLE_OPPORTUNITIES_API=true — /api/opportunities registered');
}
app.route('/api/approvals', approvalsRoute);
app.route('/api/runs', runsRoute);
app.route('/api/metrics', metricsRoute);
app.route('/api/planner', plannerRoute);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('[api] error:', err);
  return c.json({ error: err.message }, 500);
});

const port = parseInt(process.env.API_PORT ?? '4000', 10);
console.log(`[api] listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
