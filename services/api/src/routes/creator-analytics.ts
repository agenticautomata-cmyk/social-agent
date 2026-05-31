import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  computeAnalyticsHub,
  computePlatformDashboard,
  CSV_TEMPLATE_HEADER,
  ensureDemoCreatorAnalytics,
  importVideoRows,
  parseCsvText,
  parseJsonImport,
  seedDemoCreatorAnalytics,
} from '@social-agent/core/creator-analytics';
import {
  buildOAuthStart,
  disconnectTikTok,
  getTikTokConnectionStatus,
  handleOAuthCallback,
  resolveDefaultTikTokCreatorAccountId,
} from '@social-agent/core/tiktok-oauth';

export const creatorAnalyticsRoute = new Hono();

const DASHBOARD_SETTINGS_PATH = '/analytics/tiktok/settings';

async function maybeSeedDemo() {
  if (env.DEMO_MODE) {
    await ensureDemoCreatorAnalytics();
  }
}

creatorAnalyticsRoute.get('/', async (c) => {
  await maybeSeedDemo();
  const hub = await computeAnalyticsHub(env.DEMO_MODE);
  return c.json(hub);
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
