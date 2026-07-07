import { clientApiUrl } from './client-api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** True when Benson is opened from the Home Screen icon (installed PWA). */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Web Push API surface — iOS exposes PushManager on SW registration, not on window. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  );
}

/** Can this browser/device actually subscribe? iOS requires installed PWA. */
export function isPushCapableEnvironment(): boolean {
  if (!isPushSupported()) return false;
  if (isIosDevice() && !isStandalonePwa()) return false;
  return true;
}

export async function isPushConfigured(): Promise<boolean> {
  try {
    const res = await fetch(clientApiUrl('/api/push/vapid-public-key'), { cache: 'no-store' });
    const json = (await res.json()) as { configured?: boolean };
    return !!json.configured;
  } catch {
    return false;
  }
}

export type PushSetupStatus =
  | { state: 'ready' }
  | { state: 'unsupported' }
  | { state: 'not_configured' }
  | { state: 'needs_pwa_install' }
  | { state: 'blocked' }
  | { state: 'needs_permission' }
  | { state: 'needs_subscription' };

export type DevicePushState = {
  permission: NotificationPermission;
  standalone: boolean;
  ios: boolean;
  pushCapable: boolean;
  hasLocalSubscription: boolean;
  subscriptionEndpoint: string | null;
  /** True only when permission is granted AND this device has an active PushSubscription. */
  deviceRegistered: boolean;
};

export async function getLocalPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

export async function getDevicePushState(): Promise<DevicePushState> {
  const permission =
    typeof Notification !== 'undefined' ? Notification.permission : ('default' as NotificationPermission);
  const standalone = isStandalonePwa();
  const ios = isIosDevice();
  const pushCapable = isPushCapableEnvironment();
  const subscription = await getLocalPushSubscription();
  const subscriptionEndpoint = subscription?.endpoint ?? null;

  return {
    permission,
    standalone,
    ios,
    pushCapable,
    hasLocalSubscription: Boolean(subscription),
    subscriptionEndpoint,
    deviceRegistered: permission === 'granted' && Boolean(subscription?.endpoint),
  };
}

/** True when the user still needs to grant permission or complete push subscription. */
export async function getPushSetupStatus(): Promise<PushSetupStatus> {
  if (!isPushSupported()) return { state: 'unsupported' };
  if (!(await isPushConfigured())) return { state: 'not_configured' };
  if (isIosDevice() && !isStandalonePwa()) return { state: 'needs_pwa_install' };

  const permission = Notification.permission;
  if (permission === 'denied') return { state: 'blocked' };
  if (permission === 'default') return { state: 'needs_permission' };

  const existing = await getLocalPushSubscription();
  if (existing?.endpoint) return { state: 'ready' };

  return { state: 'needs_subscription' };
}

export async function shouldOfferPushAfterCelebration(): Promise<boolean> {
  const status = await getPushSetupStatus();
  return status.state === 'needs_permission' || status.state === 'needs_subscription';
}

export async function ensureServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
}

/**
 * Must be the first await inside a user click/tap handler (iOS requires direct gesture).
 * Do not call setState before this on iOS.
 */
export async function requestNotificationPermissionInGesture(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
}

/** Subscribe + persist after permission is already granted. */
export async function completePushSubscriptionAfterGrant(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushCapableEnvironment()) {
    return {
      ok: false,
      error: isIosDevice()
        ? 'Open Benson from your Home Screen icon, then try again.'
        : 'Push notifications are not supported in this browser',
    };
  }

  if (Notification.permission !== 'granted') {
    return { ok: false, error: 'Notification permission not granted' };
  }

  try {
    const keyRes = await fetch(clientApiUrl('/api/push/vapid-public-key'));
    const keyJson = (await keyRes.json()) as { publicKey: string | null; configured?: boolean };
    if (!keyJson.publicKey) {
      return { ok: false, error: 'Push is not configured on the server yet' };
    }

    const registration = await ensureServiceWorkerRegistered();
    if (!registration) {
      return { ok: false, error: 'Could not register the notification service worker' };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey) as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { ok: false, error: 'Invalid push subscription from browser' };
    }

    const res = await fetch(clientApiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: {
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
        },
      }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'Subscribe failed' };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Subscribe failed' };
  }
}

/** Full enable flow — permission request must run first in the click handler. */
export async function subscribeToPushNotifications(): Promise<{ ok: boolean; error?: string }> {
  const permission = await requestNotificationPermissionInGesture();
  if (permission !== 'granted') {
    return {
      ok: false,
      error:
        permission === 'denied'
          ? 'Notification permission denied — reset in iOS Settings > Notifications > Benson'
          : 'Permission not granted',
    };
  }
  return completePushSubscriptionAfterGrant();
}

export async function resetPushDevice(): Promise<{ ok: boolean; error?: string }> {
  try {
    const subscription = await getLocalPushSubscription();
    if (subscription?.endpoint) {
      await fetch(clientApiUrl('/api/push/subscribe'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Reset failed' };
  }
}

export async function sendTestPushToThisDevice(): Promise<{
  ok: boolean;
  error?: string;
  sent?: number;
  skipped?: boolean;
  reason?: string;
}> {
  const subscription = await getLocalPushSubscription();
  if (!subscription?.endpoint) {
    return { ok: false, error: 'No push subscription on this device — tap Enable Notifications first' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, error: 'Notification permission is not granted on this device' };
  }

  try {
    const res = await fetch(clientApiUrl('/api/push/test'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      result?: { sent: number; failed?: number; skipped?: boolean; reason?: string };
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'Test push failed' };
    }
    if (json.result?.skipped) {
      return {
        ok: false,
        error: `Test not sent: ${json.result.reason ?? 'unknown'}`,
        skipped: true,
        reason: json.result.reason,
      };
    }
    if ((json.result?.sent ?? 0) < 1) {
      return { ok: false, error: 'Test push failed — no notification was delivered' };
    }
    return { ok: true, sent: json.result?.sent ?? 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Test push failed' };
  }
}
