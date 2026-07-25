import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  computeAnalyticsHub,
  computePlatformDashboard,
  computeTikTokAnalyticsDebug,
  CSV_TEMPLATE_HEADER,
  classifyTikTokVideos,
  clearStaleTikTokFollowers,
  ensureDemoCreatorAnalytics,
  importVideoRows,
  parseCsvText,
  parseJsonImport,
  seedDemoCreatorAnalytics,
} from '@social-agent/core/creator-analytics';
import {
  buildOAuthDebugUrl,
  buildOAuthStart,
  disconnectTikTok,
  getTikTokConnectionStatus,
  handleOAuthCallback,
  resolveDefaultTikTokCreatorAccountId,
} from '@social-agent/core/tiktok-oauth';
import {
  listAnalyticsConnectors,
  getAnalyticsConnectorSettings,
  updateAnalyticsConnectorSettings,
} from '@social-agent/core/analytics-connectors';
import {
  runCreatorAnalyticsSync,
  getAnalyticsSyncStatus,
} from '@social-agent/core/creator-analytics-sync';
import { analyzeStrategistBriefing } from '@social-agent/core/strategist';
import { runTikTokPulse } from '@social-agent/core/benson-pulse';
import { runBensonLearningCycle } from '@social-agent/core/benson-learning';
import { getDataRevisionStatus } from '@social-agent/core/data-revision';
import {
  buildMetaOAuthStart,
  disconnectMeta,
  getMetaConnectionStatus,
  handleMetaOAuthCallback,
} from '@social-agent/core/meta-oauth';

export const creatorAnalyticsRoute = new Hono();

const DASHBOARD_SETTINGS_PATH = '/analytics/tiktok/settings';

async function maybeSeedDemo() {
  if (!env.DEMO_MODE) return;
  const status = await getTikTokConnectionStatus(false);
  if (status.status === 'connected') return;
  await ensureDemoCreatorAnalytics();
}

creatorAnalyticsRoute.get('/', async (c) => {
  await maybeSeedDemo();
  const hub = await computeAnalyticsHub(env.DEMO_MODE);
  return c.json(hub);
});

creatorAnalyticsRoute.get('/connectors', async (c) => {
  const connectors = await listAnalyticsConnectors();
  return c.json({ connectors });
});

creatorAnalyticsRoute.get('/settings', async (c) => {
  const settings = await getAnalyticsConnectorSettings();
  return c.json({ ok: true, settings });
});

creatorAnalyticsRoute.patch('/settings', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const patch: { facebook?: boolean; instagram?: boolean; youtube?: boolean } = {};
  if (typeof body?.facebook === 'boolean') patch.facebook = body.facebook;
  if (typeof body?.instagram === 'boolean') patch.instagram = body.instagram;
  if (typeof body?.youtube === 'boolean') patch.youtube = body.youtube;
  if (patch.facebook === undefined && patch.instagram === undefined && patch.youtube === undefined) {
    return c.json({ error: 'Provide facebook, instagram, and/or youtube boolean toggles' }, 400);
  }
  const settings = await updateAnalyticsConnectorSettings(patch);
  return c.json({ ok: true, settings });
});

creatorAnalyticsRoute.get('/sync/status', async (c) => {
  const status = await getAnalyticsSyncStatus();
  return c.json(status);
});

creatorAnalyticsRoute.post('/sync', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const provider = typeof body?.provider === 'string' ? body.provider : undefined;
  const providers =
    provider === 'all' || !provider
      ? undefined
      : [provider as 'tiktok' | 'facebook' | 'instagram' | 'youtube'];
  try {
    const result = await runCreatorAnalyticsSync({
      providers,
      trigger: 'manual',
    });
    const tiktokOk = result.results.some(
      (r) => r.provider === 'tiktok' && r.ok && !r.skipped,
    );
    let pulseResult: Awaited<ReturnType<typeof runTikTokPulse>> | null = null;
    let learningResult: Awaited<ReturnType<typeof runBensonLearningCycle>> | null = null;
    if (tiktokOk) {
      [pulseResult, learningResult] = await Promise.all([
        runTikTokPulse({ skipSync: true }).catch((err) => ({
          ok: false,
          synced: false,
          syncError: err instanceof Error ? err.message : 'pulse_failed',
          changed: false,
          briefGenerated: false,
          reason: 'pulse_failed',
        })),
        runBensonLearningCycle().catch((err) => ({
          ran: false,
          reason: err instanceof Error ? err.message : 'learning_failed',
        })),
      ]);
    }
    const [hub, dataRevision] = await Promise.all([
      computeAnalyticsHub(env.DEMO_MODE),
      getDataRevisionStatus(),
    ]);
    return c.json({ ...result, hub, pulseResult, learningResult, dataRevision });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    if (message.includes('already in progress')) {
      return c.json({ error: message }, 409);
    }
    return c.json({ error: message }, 500);
  }
});

const META_SETTINGS_PATH = '/analytics/meta/settings';

creatorAnalyticsRoute.get('/meta/oauth/start', async (c) => {
  const start = await buildMetaOAuthStart();
  if (start.mode === 'error') {
    const status = start.code === 'connectors_disabled' ? 403 : 503;
    return c.json(
      { error: start.code, message: start.message, missing: start.missing },
      status,
    );
  }
  const wantsJson =
    c.req.query('format') === 'json' ||
    (c.req.header('accept') ?? '').includes('application/json');
  if (wantsJson) {
    return c.json({ authorizationUrl: start.authorizationUrl, state: start.state });
  }
  return c.redirect(start.authorizationUrl, 302);
});

creatorAnalyticsRoute.get('/meta/oauth/callback', async (c) => {
  const result = await handleMetaOAuthCallback({
    code: c.req.query('code'),
    state: c.req.query('state'),
    error: c.req.query('error'),
    error_description: c.req.query('error_description'),
  });
  const base = process.env.DASHBOARD_PUBLIC_URL ?? 'http://localhost:3000';
  if (result.ok) {
    void runCreatorAnalyticsSync({
      providers: ['facebook', 'instagram'],
      trigger: 'manual',
    }).catch(() => {});
    const q = new URLSearchParams({ connected: '1', page: result.pageName });
    if (result.igUsername) q.set('ig', result.igUsername);
    return c.redirect(`${base}${META_SETTINGS_PATH}?${q}`, 302);
  }
  return c.redirect(
    `${base}${META_SETTINGS_PATH}?error=${encodeURIComponent(result.error)}`,
    302,
  );
});

creatorAnalyticsRoute.get('/meta/status', async (c) => {
  const status = await getMetaConnectionStatus(env.DEMO_MODE);
  return c.json(status);
});

creatorAnalyticsRoute.post('/meta/disconnect', async (c) => {
  const result = await disconnectMeta();
  return c.json({ ok: true, ...result });
});

creatorAnalyticsRoute.get('/tiktok/oauth/debug-url', async (c) => {
  const debug = await buildOAuthDebugUrl();
  return c.json(debug);
});

creatorAnalyticsRoute.get('/tiktok/oauth/start', async (c) => {
  const start = await buildOAuthStart();
  if (start.mode === 'error') {
    return c.json(
      {
        error: start.code,
        message: start.message,
        missing: start.missing,
      },
      503,
    );
  }

  const wantsJson =
    c.req.query('format') === 'json' ||
    (c.req.header('accept') ?? '').includes('application/json');

  if (wantsJson) {
    return c.json({
      authorizationUrl: start.authorizationUrl,
      state: start.state,
    });
  }

  console.log('[tiktok-oauth] browser redirect to authorize URL:', start.authorizationUrl);
  return c.redirect(start.authorizationUrl, 302);
});

creatorAnalyticsRoute.get('/tiktok/oauth/callback', async (c) => {
  const result = await handleOAuthCallback({
    code: c.req.query('code'),
    state: c.req.query('state'),
    error: c.req.query('error'),
    error_description: c.req.query('error_description'),
  });

  const base = process.env.DASHBOARD_PUBLIC_URL ?? 'http://localhost:3000';
  if (result.ok) {
    void runCreatorAnalyticsSync({
      providers: ['tiktok'],
      trigger: 'manual',
    })
      .then(() => runTikTokPulse({ skipSync: true }))
      .catch((err) => {
        console.warn(
          '[tiktok-oauth] post-connect sync/pulse failed:',
          err instanceof Error ? err.message : err,
        );
      });
    void analyzeStrategistBriefing().catch((err) => {
      console.warn(
        '[tiktok-oauth] post-connect strategist refresh failed:',
        err instanceof Error ? err.message : err,
      );
    });
    const q = result.username ? `?connected=1&username=${encodeURIComponent(result.username)}` : '?connected=1';
    return c.redirect(`${base}${DASHBOARD_SETTINGS_PATH}${q}`, 302);
  }

  return c.redirect(
    `${base}${DASHBOARD_SETTINGS_PATH}?error=${encodeURIComponent(result.error)}`,
    302,
  );
});

creatorAnalyticsRoute.get('/tiktok/status', async (c) => {
  const status = await getTikTokConnectionStatus(env.DEMO_MODE);
  return c.json(status);
});

creatorAnalyticsRoute.get('/tiktok/debug', async (c) => {
  const debug = await computeTikTokAnalyticsDebug(env.DEMO_MODE);
  return c.json(debug);
});

creatorAnalyticsRoute.post('/tiktok/disconnect', async (c) => {
  const creatorAccountId = await resolveDefaultTikTokCreatorAccountId();
  const result = await disconnectTikTok(creatorAccountId);
  return c.json({
    ok: true,
    disconnected: result.disconnected,
    alreadyDisconnected: result.alreadyDisconnected,
  });
});

creatorAnalyticsRoute.get('/tiktok', async (c) => {
  await maybeSeedDemo();
  const dashboard = await computePlatformDashboard('tiktok', env.DEMO_MODE);
  return c.json(dashboard);
});

creatorAnalyticsRoute.get('/import/template', (c) => {
  const sample = `${CSV_TEMPLATE_HEADER}
demo_001,Sample title,Sample caption,https://www.tiktok.com/@kelliekc/video/demo_001,,2026-05-01T18:00:00Z,dining,local_secret,Crossroads,restaurant,,12000,900,80,120,200,96000,8.0,0.65,125000`;

  return c.text(sample, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="benson-tiktok-import-template.csv"',
  });
});

creatorAnalyticsRoute.post('/import/csv', async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  let csvText = '';

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const file = form.get('file');
    if (file instanceof File) {
      csvText = await file.text();
    } else {
      const raw = form.get('csv');
      csvText = typeof raw === 'string' ? raw : '';
    }
  } else {
    csvText = await c.req.text();
  }

  if (!csvText.trim()) {
    return c.json({ error: 'CSV body or file is required' }, 400);
  }

  const { rows, errors: parseErrors } = parseCsvText(csvText);
  const result = await importVideoRows(rows);
  result.errors.push(...parseErrors);

  return c.json({ demoMode: env.DEMO_MODE, ...result });
});

const ManualSchema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'youtube_shorts', 'linkedin']).optional(),
  username: z.string().optional(),
  video: z.object({
    video_id: z.string().min(1),
    title: z.string().optional().nullable(),
    caption: z.string().optional().nullable(),
    post_url: z.string().optional().nullable(),
    thumbnail_url: z.string().optional().nullable(),
    published_at: z.string().min(1),
    content_category: z.string().optional().nullable(),
    content_pillar: z.string().optional().nullable(),
    location_tag: z.string().optional().nullable(),
    sponsor_tag: z.string().optional().nullable(),
    opportunity_id: z.string().uuid().optional().nullable(),
    views: z.number().optional().nullable(),
    likes: z.number().optional().nullable(),
    comments: z.number().optional().nullable(),
    shares: z.number().optional().nullable(),
    saves: z.number().optional().nullable(),
    watch_time_seconds: z.number().optional().nullable(),
    average_watch_duration_seconds: z.number().optional().nullable(),
    completion_rate: z.number().optional().nullable(),
    follower_count_snapshot: z.number().optional().nullable(),
    engagement_rate: z.number().optional().nullable(),
  }),
});

creatorAnalyticsRoute.post('/import/manual', async (c) => {
  const body = await c.req.json();
  const parsed = ManualSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { platform, username, video } = parsed.data;
  const result = await importVideoRows([video], {
    platform: platform ?? 'tiktok',
    username: username ?? 'kelliekc',
    source: 'manual',
  });

  return c.json({ demoMode: env.DEMO_MODE, ...result });
});

creatorAnalyticsRoute.post('/import/json', async (c) => {
  const body = await c.req.json();
  const platform = typeof body?.platform === 'string' ? body.platform : 'tiktok';
  const username = typeof body?.username === 'string' ? body.username : 'kelliekc';
  const items = body?.videos ?? body;

  const { rows, errors: parseErrors } = parseJsonImport(items);
  const result = await importVideoRows(rows, {
    platform: platform as 'tiktok',
    username,
    source: 'import',
  });
  result.errors.push(...parseErrors);

  return c.json({ demoMode: env.DEMO_MODE, ...result });
});

creatorAnalyticsRoute.post('/seed-demo', async (c) => {
  const result = await seedDemoCreatorAnalytics();
  return c.json({ demoMode: env.DEMO_MODE, ...result });
});
