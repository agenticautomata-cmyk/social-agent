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
import { draftsRoute } from './routes/drafts.js';
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
import { discoverySubscriptionsRoute } from './routes/discovery-subscriptions.js';
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
import { outcomesRoute } from './routes/outcomes.js';
import { shootRoute } from './routes/shoot.js';
import { controlTowerRoute } from './routes/control-tower.js';
import { adminSpendRoute } from './routes/admin-spend.js';
import { earlySignalsRoute } from './routes/early-signals.js';
import { creatorAgentRoute } from './routes/creator-agent.js';
import { creatorInterestRoute } from './routes/creator-interest.js';
import { creatorPartnershipsRoute } from './routes/creator-partnerships.js';
import { programLibraryRoute } from './routes/program-library.js';
import { dataRevisionRoute } from './routes/data-revision.js';
import { voiceRoute } from './routes/voice.js';
import { watchlistRoute, scoutAdminRoute } from './routes/watchlist.js';
import { calendarRoute } from './routes/calendar.js';
import { bensonVoiceRoute } from './routes/benson-voice.js';
import { newsletterIntelligenceRoute } from './routes/newsletter-intelligence.js';
import { getHealthReadiness, checkProductionDependencies } from '@social-agent/core/control-tower';
import { getBuildIdentity } from '@social-agent/core/build-identity';
import { startVoiceQueueProcessor } from '@social-agent/core/benson-voice';
import { randomUUID } from 'node:crypto';

const app = new Hono();

const BENSON_VERSION = '0.1.0';
const BUILD_IDENTITY = getBuildIdentity('benson-api');

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
    identity: BUILD_IDENTITY,
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
app.use('*', async (c, next) => {
  c.set('requestId', c.req.header('x-benson-request-id') ?? randomUUID());
  await next();
});

app.get('/health', (c) =>
  c.json({
    ok: true,
    identity: {
      gitCommit: BUILD_IDENTITY.gitCommit,
      releaseTag: BUILD_IDENTITY.releaseTag,
      serviceName: BUILD_IDENTITY.serviceName,
      environment: BUILD_IDENTITY.environment,
    },
  }),
);
app.get('/api/health/identity', (c) => c.json({ ok: true, identity: BUILD_IDENTITY }));
app.get('/api/health', async (c) => {
  const readiness = await getHealthReadiness();
  const payload = {
    ...apiHealthPayload(),
    state: readiness.state,
    ready: readiness.ready,
  };
  return c.json(payload, readiness.ready ? 200 : 503);
});
app.get('/api/health/live', (c) => c.json({ ok: true, live: true, uptimeSeconds: Math.floor(process.uptime()) }));
app.get('/api/health/ready', async (c) => {
  const readiness = await getHealthReadiness();
  return c.json(
    { ready: readiness.ready, state: readiness.state, checkedAt: new Date().toISOString() },
    readiness.ready ? 200 : 503,
  );
});
app.get('/api/health/dependencies', async (c) => {
  const dependencies = await checkProductionDependencies();
  const failed = dependencies.some((d) => d.status === 'failed');
  const degraded = dependencies.some((d) => d.status === 'degraded');
  return c.json(
    {
      ok: !failed,
      state: failed ? 'failed' : degraded ? 'degraded' : 'healthy',
      dependencies,
    },
    failed ? 503 : 200,
  );
});

app.route('/api/public/website', publicWebsiteRoute);

app.route('/api/campaigns', campaignsRoute);
app.route('/api/content', contentRoute);
if (featureFlags.enableOpportunitiesApi) {
  app.route('/api/opportunities', opportunitiesRoute);
  app.route('/api/intake', intakeRoute);
  app.route('/api/drafts', draftsRoute);
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
  app.route('/api/discovery-subscriptions', discoverySubscriptionsRoute);
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
  app.route('/api/outcomes', outcomesRoute);
  app.route('/api/shoot', shootRoute);
  app.route('/api/control-tower', controlTowerRoute);
  app.route('/api/admin/spend', adminSpendRoute);
  app.route('/api/early-signals', earlySignalsRoute);
  app.route('/api/creator-agent', creatorAgentRoute);
  app.route('/api/creator-interest', creatorInterestRoute);
  app.route('/api/creator-partnerships', creatorPartnershipsRoute);
  app.route('/api/program-library', programLibraryRoute);
  app.route('/api/data-revision', dataRevisionRoute);
  app.route('/api/voice', voiceRoute);
  app.route('/api/watchlist', watchlistRoute);
  app.route('/api/scout/admin', scoutAdminRoute);
  app.route('/api/calendar', calendarRoute);
  app.route('/api/benson-voice', bensonVoiceRoute);
  app.route('/api/newsletter-intelligence', newsletterIntelligenceRoute);
  startVoiceQueueProcessor(parseInt(process.env.VOICE_QUEUE_INTERVAL_MS ?? '750', 10));
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
  return c.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Internal server error',
      },
    },
    500,
  );
});

const port = parseInt(process.env.API_PORT ?? '4000', 10);
console.log(
  JSON.stringify({
    level: 'info',
    service: 'benson-api',
    message: 'API listening',
    timestamp: new Date().toISOString(),
    port,
    pid: process.pid,
    identity: BUILD_IDENTITY,
  }),
);
serve({ fetch: app.fetch, port });
