'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BensonDancer } from './benson-dancer';
import { PushTopicChecklist } from './push-topic-checklist';
import {
  getPushSetupStatus,
  requestNotificationPermissionInGesture,
  completePushSubscriptionAfterGrant,
  type PushSetupStatus,
} from '../lib/push-subscribe';
import { usePushNotifications } from '../lib/use-push-notifications';

function needsPrompt(status: PushSetupStatus | null): status is Exclude<
  PushSetupStatus,
  { state: 'ready' | 'unsupported' | 'not_configured' }
> {
  if (!status) return false;
  return (
    status.state === 'needs_permission' ||
    status.state === 'needs_subscription' ||
    status.state === 'needs_pwa_install' ||
    status.state === 'blocked'
  );
}

function permissionLabel(permission: NotificationPermission): string {
  switch (permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    default:
      return 'not asked yet';
  }
}

const PUSH_PROMPT_SNOOZE_KEY = 'benson-push-prompt-snooze-until';

function isPushPromptSnoozed(): boolean {
  try {
    const until = localStorage.getItem(PUSH_PROMPT_SNOOZE_KEY);
    if (!until) return false;
    return Date.now() < Number(until);
  } catch {
    return false;
  }
}

function snoozePushPrompt(days = 3) {
  try {
    localStorage.setItem(PUSH_PROMPT_SNOOZE_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
  } catch {
    /* ignore */
  }
}

export function PushPermissionPromptShell() {
  const { reload, loading, busy: pushBusy, configured, preferences, topics, permission, standalone, deviceRegistered, updatePreferences } =
    usePushNotifications();
  const [setupStatus, setSetupStatus] = useState<PushSetupStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    setSnoozed(isPushPromptSnoozed());
  }, []);

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    try {
      const status = await getPushSetupStatus();
      setSetupStatus(status);
      if (status.state === 'ready') setError(null);
      await reload();
    } catch {
      setSetupStatus(null);
    } finally {
      setChecking(false);
    }
  }, [reload]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const onCelebration = (event: Event) => {
      const detail = (event as CustomEvent<{ open: boolean }>).detail;
      setCelebrationOpen(!!detail?.open);
    };
    window.addEventListener('benson-celebration', onCelebration);
    return () => window.removeEventListener('benson-celebration', onCelebration);
  }, []);

  useEffect(() => {
    const recheck = () => void refreshStatus();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshStatus();
    };
    window.addEventListener('pageshow', recheck);
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', recheck);
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshStatus]);

  const show = !checking && !celebrationOpen && !snoozed && needsPrompt(setupStatus);

  async function onEnableNotificationsClick() {
    setError(null);

    if (setupStatus?.state === 'needs_pwa_install') {
      setError('Add Benson to your Home Screen first, then open it from the icon.');
      return;
    }

    // iOS: requestPermission must be the first await in this tap handler.
    const permission = await requestNotificationPermissionInGesture();
    await reload();

    if (permission !== 'granted') {
      setError(
        permission === 'denied'
          ? 'Notifications blocked. Reset in iOS Settings → Notifications → Benson.'
          : 'Permission not granted.',
      );
      await refreshStatus();
      return;
    }

    setBusy(true);
    try {
      const result = await completePushSubscriptionAfterGrant();
      if (!result.ok) throw new Error(result.error ?? 'Could not enable notifications');
      await reload();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  if (!show || loading) return null;

  const blocked = setupStatus?.state === 'blocked';
  const needsPwa = setupStatus?.state === 'needs_pwa_install';
  const masterEnabled = preferences?.masterEnabled ?? true;

  return (
    <div className="fixed inset-0 z-[98] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-hidden />
      <div
        className="relative z-[99] w-full max-w-lg glass-panel-strong gradient-border p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="push-permission-headline"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <BensonDancer size={40} variant="compact" />
          </div>
          <div className="space-y-1 text-left min-w-0">
            <h2 id="push-permission-headline" className="text-lg font-semibold gradient-text">
              {blocked
                ? 'Notifications are blocked'
                : needsPwa
                  ? 'Open Benson from Home Screen'
                  : 'Turn on Benson notifications'}
            </h2>
            <p className="text-sm text-paper-soft leading-relaxed">
              {blocked
                ? 'Benson cannot send alerts until you allow notifications in iOS Settings.'
                : needsPwa
                  ? 'On iPhone, push only works in the installed app. Share → Add to Home Screen, then open Benson from the icon.'
                  : 'Benson will ping you for milestones, daily moves, TikTok pulse, and action reminders.'}
            </p>
          </div>
        </div>

        <div className="text-xs border border-white/10 rounded-xl px-4 py-3 bg-black/20 space-y-1 font-mono">
          <p>
            <span className="text-paper-muted">Installed app:</span>{' '}
            {standalone ? 'yes' : 'no — use Home Screen icon'}
          </p>
          <p>
            <span className="text-paper-muted">Notification.permission:</span>{' '}
            {permissionLabel(permission)}
          </p>
          <p>
            <span className="text-paper-muted">Push subscription:</span>{' '}
            {deviceRegistered ? 'active on this device' : 'none on this device'}
          </p>
        </div>

        {!blocked && !needsPwa && (
          <section className="space-y-3 border border-white/10 rounded-xl p-4 bg-black/20">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={masterEnabled}
                disabled={pushBusy || busy}
                onChange={(e) => void updatePreferences({ masterEnabled: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              <span>Allow Benson push notifications</span>
            </label>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-paper-muted mb-2">
                What to push
              </h3>
              <PushTopicChecklist
                topics={topics}
                selected={preferences?.topics ?? {}}
                masterEnabled={masterEnabled}
                disabled={pushBusy || busy}
                onToggle={(topicId, enabled) =>
                  void updatePreferences({ topics: { [topicId]: enabled } })
                }
                compact
              />
            </div>
          </section>
        )}

        {blocked && (
          <section className="space-y-2 text-sm text-paper-soft border border-amber-400/30 bg-amber-400/10 rounded-xl px-4 py-3">
            <p className="font-medium text-amber-100">Reset on iPhone (installed PWA)</p>
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li>Open iOS Settings → Notifications</li>
              <li>Find Benson in the list (after you tap Allow once, it appears here)</li>
              <li>Turn on Allow Notifications</li>
              <li>Return to Benson from your Home Screen icon</li>
            </ol>
            <p className="text-xs text-paper-muted pt-1">
              If Benson is not listed yet, you may have denied the prompt — delete and re-add the
              Home Screen app, or reset website permissions under Settings → Apps → Benson.
            </p>
          </section>
        )}

        {needsPwa && (
          <section className="text-xs text-paper-soft border border-amber-400/30 bg-amber-400/10 rounded-xl px-4 py-3">
            <p>In Safari: tap Share → Add to Home Screen. Then launch Benson from that icon and tap
            Enable Notifications here.</p>
          </section>
        )}

        {error && <p className="text-xs text-red-300">{error}</p>}

        {!blocked && !needsPwa && (
          <button
            type="button"
            disabled={busy || pushBusy || !configured}
            onClick={() => void onEnableNotificationsClick()}
            className="btn-primary w-full disabled:opacity-50"
          >
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
        )}

        {!blocked && (
          <button
            type="button"
            disabled={busy || pushBusy}
            onClick={() => {
              snoozePushPrompt();
              setSnoozed(true);
            }}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-paper-muted hover:bg-white/10"
          >
            Not now
          </button>
        )}

        {!configured && !blocked && !needsPwa && (
          <p className="text-xs text-paper-muted text-center">
            Server push keys not configured — ask your admin to add VAPID keys.
          </p>
        )}

        <p className="text-2xs text-paper-muted text-center">
          <Link href="/settings/notifications" className="link">
            Full notification settings
          </Link>
        </p>
      </div>
    </div>
  );
}
