'use client';

import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../lib/client-api';
import {
  completePushSubscriptionAfterGrant,
  getDevicePushState,
  isPushCapableEnvironment,
  isPushSupported,
  requestNotificationPermissionInGesture,
  resetPushDevice,
  sendTestPushToThisDevice,
  type DevicePushState,
} from '../lib/push-subscribe';

export type PushTopic = {
  id: string;
  label: string;
  description: string;
};

export type PushPreferences = {
  masterEnabled: boolean;
  topics: Record<string, boolean>;
  subscriptionCount: number;
  updatedAt: string;
};

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [pushCapable, setPushCapable] = useState(false);
  const [device, setDevice] = useState<DevicePushState | null>(null);
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [topics, setTopics] = useState<PushTopic[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshDevice = useCallback(async () => {
    const state = await getDevicePushState();
    setDevice(state);
    return state;
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/push/preferences'), { cache: 'no-store' });
      const json = (await res.json()) as {
        ok: boolean;
        preferences: PushPreferences;
        topics: PushTopic[];
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Failed to load push settings');

      const keyRes = await fetch(clientApiUrl('/api/push/vapid-public-key'), { cache: 'no-store' });
      const keyJson = (await keyRes.json()) as { configured?: boolean };
      setConfigured(!!keyJson.configured);
      setPreferences(json.preferences);
      setTopics(json.topics ?? []);
      await refreshDevice();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load push settings');
    } finally {
      setLoading(false);
    }
  }, [refreshDevice]);

  useEffect(() => {
    setSupported(isPushSupported());
    setPushCapable(isPushCapableEnvironment());
    void reload();
  }, [reload]);

  const enableNotifications = useCallback(async () => {
    if (!supported) {
      setError('Push notifications are not supported in this browser');
      return;
    }
    if (!pushCapable) {
      setError('On iPhone, open Benson from your Home Screen icon (installed app), not Safari.');
      return;
    }

    setError(null);
    setMessage(null);

    // iOS: first await in the click handler must be requestPermission — no setState before this.
    const permission = await requestNotificationPermissionInGesture();
    await refreshDevice();

    if (permission !== 'granted') {
      setError(
        permission === 'denied'
          ? 'Notifications blocked. Reset in iOS Settings → Notifications → Benson.'
          : 'Permission not granted.',
      );
      return;
    }

    setBusy(true);
    try {
      const result = await completePushSubscriptionAfterGrant();
      if (!result.ok) throw new Error(result.error ?? 'Subscribe failed');
      await reload();
      setMessage('Notifications enabled on this device.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscribe failed');
      await refreshDevice();
    } finally {
      setBusy(false);
    }
  }, [supported, pushCapable, reload, refreshDevice]);

  const resetDevice = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await resetPushDevice();
      if (!result.ok) throw new Error(result.error ?? 'Reset failed');
      await reload();
      setMessage('Device reset — notifications removed from this phone.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const updatePreferences = useCallback(
    async (patch: { masterEnabled?: boolean; topics?: Record<string, boolean> }) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch(clientApiUrl('/api/push/preferences'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const json = (await res.json()) as { ok: boolean; preferences?: PushPreferences; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error ?? 'Save failed');
        if (json.preferences) setPreferences(json.preferences);
        setMessage('Notification preferences saved.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const sendTest = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await sendTestPushToThisDevice();
      if (!result.ok) throw new Error(result.error ?? 'Test failed');
      setMessage(`Test sent — check your notification center (${result.sent ?? 1} delivered).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const permission = device?.permission ?? 'default';
  const deviceRegistered = device?.deviceRegistered ?? false;

  return {
    supported,
    pushCapable,
    standalone: device?.standalone ?? false,
    ios: device?.ios ?? false,
    permission,
    deviceRegistered,
    subscriptionEndpoint: device?.subscriptionEndpoint ?? null,
    preferences,
    topics,
    configured,
    loading,
    busy,
    error,
    message,
    reload,
    enableNotifications,
    resetDevice,
    updatePreferences,
    sendTest,
    // legacy alias
    subscribe: enableNotifications,
    unsubscribe: resetDevice,
  };
}
