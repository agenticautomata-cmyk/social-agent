import webpush from 'web-push';
import { env } from '../env.js';
import type { PushNotificationPayload } from './constants.js';
import { isPushTopicEnabled, markPushTopicSent, getPushPreferences } from './preferences.js';
import { listPushSubscriptions, removePushSubscription } from './subscriptions.js';

let configured = false;

function ensureWebPushConfigured(): boolean {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return false;
  }

  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return env.VAPID_PUBLIC_KEY ?? null;
}

export type PushSendResult = {
  sent: number;
  failed: number;
  skipped: boolean;
  reason?: string;
};

export async function sendBensonPush(
  payload: PushNotificationPayload,
  options?: { force?: boolean },
): Promise<PushSendResult> {
  if (!ensureWebPushConfigured()) {
    return { sent: 0, failed: 0, skipped: true, reason: 'vapid_not_configured' };
  }

  if (!options?.force) {
    const enabled = await isPushTopicEnabled(payload.topic);
    if (!enabled) {
      return { sent: 0, failed: 0, skipped: true, reason: 'topic_disabled' };
    }
  } else {
    const prefs = await getPushPreferences();
    if (!prefs.masterEnabled) {
      return { sent: 0, failed: 0, skipped: true, reason: 'master_disabled' };
    }
  }

  const subscriptions = await listPushSubscriptions();
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, skipped: true, reason: 'no_subscriptions' };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/home',
    topic: payload.topic,
    celebration: payload.celebration ?? null,
    milestone: payload.milestone ?? null,
    followerCount: payload.followerCount ?? null,
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await removePushSubscription(sub.endpoint);
        }
        console.warn('[push] send failed:', status ?? err);
      }
    }),
  );

  if (sent > 0) {
    await markPushTopicSent(payload.topic);
  }

  return { sent, failed, skipped: false };
}

export async function sendTestPush(endpoint?: string): Promise<PushSendResult> {
  const payload = {
    topic: 'tiktok_pulse' as const,
    title: 'Benson',
    body: 'Push notifications are working.',
    url: '/settings/notifications',
  };

  if (endpoint) {
    return sendBensonPushToEndpoint(endpoint, payload, { force: true });
  }

  return sendBensonPush(payload, { force: true });
}

export async function sendBensonPushToEndpoint(
  endpoint: string,
  payload: PushNotificationPayload,
  options?: { force?: boolean },
): Promise<PushSendResult> {
  if (!ensureWebPushConfigured()) {
    return { sent: 0, failed: 0, skipped: true, reason: 'vapid_not_configured' };
  }

  if (!options?.force) {
    const enabled = await isPushTopicEnabled(payload.topic);
    if (!enabled) {
      return { sent: 0, failed: 0, skipped: true, reason: 'topic_disabled' };
    }
  } else {
    const prefs = await getPushPreferences();
    if (!prefs.masterEnabled) {
      return { sent: 0, failed: 0, skipped: true, reason: 'master_disabled' };
    }
  }

  const subscriptions = await listPushSubscriptions();
  const sub = subscriptions.find((row) => row.endpoint === endpoint);
  if (!sub) {
    return { sent: 0, failed: 0, skipped: true, reason: 'endpoint_not_registered' };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/home',
    topic: payload.topic,
    celebration: payload.celebration ?? null,
    milestone: payload.milestone ?? null,
    followerCount: payload.followerCount ?? null,
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      body,
    );
    await markPushTopicSent(payload.topic);
    return { sent: 1, failed: 0, skipped: false };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await removePushSubscription(sub.endpoint);
    }
    console.warn('[push] send to endpoint failed:', status ?? err);
    return { sent: 0, failed: 1, skipped: false, reason: status ? `http_${status}` : 'send_failed' };
  }
}
