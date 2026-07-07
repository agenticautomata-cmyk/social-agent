import { execSync } from 'node:child_process';
import os from 'node:os';
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
import { sourcesRoute } from './routes/sources.js';
import { reportsRoute } from './routes/reports.js';
import { strategistRoute } from './routes/strategist.js';
import { askBensonRoute } from './routes/ask-benson.js';
import { preferencesRoute } from './routes/preferences.js';
import { bensonPulseRoute } from './routes/benson-pulse.js';
import { bensonLearningRoute } from './routes/benson-learning.js';
import { bensonDiscoveryRoute } from './routes/benson-discovery.js';
import { discountWatchRoute } from './routes/discount-watch.js';
import { pushRoute } from './routes/push.js';
import { creatorInfoRoute } from './routes/creator-info.js';
import { tiktokOperatorRoute } from './routes/tiktok-operator.js';
import { websiteRoute } from './routes/website.js';
import { equipmentRoute } from './routes/equipment.js';
import { playbookRoute } from './routes/playbook.js';
import { publicWebsiteRoute } from './routes/public-website.js';

const app = new Hono();

const BENSON_VERSION = '0.1.0';

function countBensonProcesses(): number {
  try {
    const out = execSync("pgrep -f 'kellie-assistant/social-agent' 2>/dev/null | wc -l", {
      encoding: 'utf8',
    }).trim();
    return parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

function apiHealthPayload() {
  const mem = process.memoryUsage();
  return {
    ok: true,
    version: BENSON_VERSION,
    buildMode: process.env.BENSON_API_MODE === 'production' ? 'production' : 'development',
    dashboardMode: process.env.BENSON_DASHBOARD_MODE ?? 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      externalBytes: mem.external,
      rssMb: Math.round(mem.rss / 1024 / 1024),
    },
    system: {
      loadAvg: os.loadavg(),
      freeMemBytes: os.freemem(),
      totalMemBytes: os.totalmem(),
    },
    processCount: countBensonProcesses(),
  };
}

app.use('*', logger());
app.use('*', cors({ origin: '*' }));

app.get('/health', (c) => c.json({ ok: true }));
app.get('/api/health', (c) => c.json(apiHealthPayload()));

app.route('/api/public/website', publicWebsiteRoute);

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
  app.route('/api/sources', sourcesRoute);
  app.route('/api/reports', reportsRoute);
  app.route('/api/strategist', strategistRoute);
  app.route('/api/ask-benson', askBensonRoute);
  app.route('/api/preferences', preferencesRoute);
  app.route('/api/benson-pulse', bensonPulseRoute);
  app.route('/api/benson-learning', bensonLearningRoute);
  app.route('/api/benson-discovery', bensonDiscoveryRoute);
  app.route('/api/discount-watch', discountWatchRoute);
  app.route('/api/tiktok-operator', tiktokOperatorRoute);
  app.route('/api/push', pushRoute);
  app.route('/api/creator-info', creatorInfoRoute);
  app.route('/api/website', websiteRoute);
  app.route('/api/equipment', equipmentRoute);
  app.route('/api/playbook', playbookRoute);
  console.log('[api] ENABLE_OPPORTUNITIES_API=true — opportunities, intake, inventory, editor, content-planner, analytics, sponsors, media-kits, outreach, sponsor-intelligence, pipeline, benson, action-center, revenue, pre-alpha, sources, reports, strategist, ask-benson, website, equipment registered');
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
