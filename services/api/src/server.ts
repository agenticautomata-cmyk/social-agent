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
import { scannerRoute } from './routes/scanner.js';
import { intakeRoute } from './routes/intake.js';
import { inventoryRoute } from './routes/inventory.js';
import { editorRoute } from './routes/editor.js';
import { contentPlannerRoute } from './routes/content-planner.js';
import { creatorAnalyticsRoute } from './routes/creator-analytics.js';
import { sponsorsRoute } from './routes/sponsors.js';
import { mediaKitsRoute } from './routes/media-kits.js';
import { outreachRoute } from './routes/outreach.js';
import { sponsorIntelligenceRoute } from './routes/sponsor-intelligence.js';
import { pipelineRoute } from './routes/pipeline.js';
import { bensonRoute } from './routes/benson.js';
import { actionCenterRoute } from './routes/action-center.js';
import { revenueRoute } from './routes/revenue.js';
import { preAlphaRoute } from './routes/pre-alpha.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: '*' }));

app.get('/health', (c) => c.json({ ok: true }));

app.route('/api/campaigns', campaignsRoute);
app.route('/api/content', contentRoute);
if (featureFlags.enableOpportunitiesApi) {
  app.route('/api/opportunities', opportunitiesRoute);
  app.route('/api/intake', intakeRoute);
  app.route('/api/inventory', inventoryRoute);
  app.route('/api/editor', editorRoute);
  app.route('/api/content-planner', contentPlannerRoute);
  app.route('/api/analytics', creatorAnalyticsRoute);
  app.route('/api/sponsors', sponsorsRoute);
  app.route('/api/media-kits', mediaKitsRoute);
  app.route('/api/outreach', outreachRoute);
  app.route('/api/sponsor-intelligence', sponsorIntelligenceRoute);
  app.route('/api/pipeline', pipelineRoute);
  app.route('/api/benson', bensonRoute);
  app.route('/api/action-center', actionCenterRoute);
  app.route('/api/revenue', revenueRoute);
  app.route('/api/pre-alpha', preAlphaRoute);
  console.log('[api] ENABLE_OPPORTUNITIES_API=true — opportunities, intake, inventory, editor, content-planner, analytics, sponsors, media-kits, outreach, sponsor-intelligence, pipeline, benson, action-center, revenue, pre-alpha registered');
}
app.route('/api/approvals', approvalsRoute);
app.route('/api/runs', runsRoute);
app.route('/api/metrics', metricsRoute);
app.route('/api/planner', plannerRoute);
if (featureFlags.enableKcScanner) {
  app.route('/api/scanner', scannerRoute);
  console.log('[api] ENABLE_KC_SCANNER=true — /api/scanner registered');
}

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('[api] error:', err);
  return c.json({ error: err.message }, 500);
});

const port = parseInt(process.env.API_PORT ?? '4000', 10);
console.log(`[api] listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
