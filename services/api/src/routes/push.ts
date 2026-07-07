import { Hono } from 'hono';
import { z } from 'zod';
import {
  getPushPreferences,
  updatePushPreferences,
  savePushSubscription,
  removePushSubscription,
  getVapidPublicKey,
  sendTestPush,
  celebrateFollowers5000,
  getPendingCelebration,
  markMilestoneCelebrated,
  sendPendingMilestonePush,
  PUSH_TOPICS,
} from '@social-agent/core/push-notifications';

export const pushRoute = new Hono();

pushRoute.get('/vapid-public-key', (c) => {
  const publicKey = getVapidPublicKey();
  return c.json({ ok: true, publicKey, configured: !!publicKey });
});

pushRoute.get('/preferences', async (c) => {
  const preferences = await getPushPreferences();
  return c.json({ ok: true, preferences, topics: PUSH_TOPICS });
});

const PreferencesSchema = z.object({
  masterEnabled: z.boolean().optional(),
  topics: z
    .record(
      z.enum([
        'tiktok_pulse',
        'local_discovery',
        'action_reminders',
        'top_picks',
        'share_intake',
        'milestones',
        'post_reminders',
        'sponsor_outreach',
      ]),
      z.boolean(),
    )
    .optional(),
});

pushRoute.put('/preferences', async (c) => {
  try {
    const body = PreferencesSchema.parse(await c.req.json());
    const preferences = await updatePushPreferences(body);
    return c.json({ ok: true, preferences });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid preferences';
    return c.json({ ok: false, error: message }, 400);
  }
});

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

pushRoute.post('/subscribe', async (c) => {
  try {
    const body = SubscribeSchema.parse(await c.req.json());
    await savePushSubscription({
      endpoint: body.subscription.endpoint,
      keys: body.subscription.keys,
      userAgent: c.req.header('user-agent'),
    });
    const milestonePush = await sendPendingMilestonePush();
    const preferences = await getPushPreferences();
    return c.json({ ok: true, preferences, milestonePush });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Subscribe failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

pushRoute.delete('/subscribe', async (c) => {
  try {
    const body = z.object({ endpoint: z.string().url() }).parse(await c.req.json());
    await removePushSubscription(body.endpoint);
    const preferences = await getPushPreferences();
    return c.json({ ok: true, preferences });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unsubscribe failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

pushRoute.post('/test', async (c) => {
  try {
    const body = z
      .object({ endpoint: z.string().url().optional() })
      .optional()
      .parse(await c.req.json().catch(() => ({})));

    const result = await sendTestPush(body?.endpoint);
    if (result.skipped || result.sent < 1) {
      return c.json(
        {
          ok: false,
          error: result.reason ?? 'Test push was not delivered',
          result,
        },
        400,
      );
    }
    return c.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Test push failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

pushRoute.get('/celebration/pending', async (c) => {
  const celebration = await getPendingCelebration();
  return c.json({ ok: true, celebration });
});

pushRoute.post('/celebration/ack', async (c) => {
  try {
    const body = z.object({ milestone: z.string().min(1) }).parse(await c.req.json());
    await markMilestoneCelebrated(body.milestone);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ack failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

pushRoute.post('/milestone/followers-5000', async (c) => {
  try {
    const body = z
      .object({
        followerCount: z.number().int().positive().optional(),
        force: z.boolean().optional(),
      })
      .optional()
      .parse(await c.req.json().catch(() => ({})));

    const result = await celebrateFollowers5000({
      followerCount: body?.followerCount,
      force: body?.force ?? true,
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Celebration failed';
    return c.json({ ok: false, error: message }, 500);
  }
});
