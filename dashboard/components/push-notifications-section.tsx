'use client';

import Link from 'next/link';
import { PushTopicChecklist } from './push-topic-checklist';
import { usePushNotifications } from '../lib/use-push-notifications';

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

export function PushNotificationsSection() {
  const push = usePushNotifications();

  if (push.loading) {
    return (
      <section className="glass-panel p-5">
        <p className="text-sm text-paper-muted">Loading notification settings…</p>
      </section>
    );
  }

  const masterEnabled = push.preferences?.masterEnabled ?? true;
  const canEnable = push.pushCapable && push.permission !== 'denied';

  return (
    <section className="glass-panel p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-paper-ink">Notifications</h2>
          <p className="text-xs text-paper-muted mt-1">
            {push.deviceRegistered
              ? 'This device is registered for push'
              : push.permission === 'denied'
                ? 'Blocked — reset in iOS Settings → Notifications → Benson'
                : push.ios && !push.standalone
                  ? 'Open from Home Screen icon to enable'
                  : 'Not enabled on this device yet'}
          </p>
          <p className="text-2xs text-paper-dim mt-1 font-mono">
            permission: {permissionLabel(push.permission)}
            {push.standalone ? ' · installed app' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {push.deviceRegistered ? (
            <button
              type="button"
              disabled={push.busy}
              onClick={() => void push.resetDevice()}
              className="btn-ghost text-xs py-2 min-h-[36px] disabled:opacity-50"
            >
              Reset device
            </button>
          ) : (
            <button
              type="button"
              disabled={push.busy || !canEnable || !push.configured}
              onClick={() => void push.enableNotifications()}
              className="btn-primary text-xs py-2 min-h-[36px] disabled:opacity-50"
            >
              Enable notifications
            </button>
          )}
          <Link href="/settings/notifications" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
            All settings
          </Link>
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={masterEnabled}
          disabled={push.busy}
          onChange={(e) => void push.updatePreferences({ masterEnabled: e.target.checked })}
          className="h-4 w-4 accent-accent"
        />
        <span>Allow Benson push notifications</span>
      </label>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-paper-muted mb-2">
          What to push
        </h3>
        <PushTopicChecklist
          topics={push.topics}
          selected={push.preferences?.topics ?? {}}
          masterEnabled={masterEnabled}
          disabled={push.busy}
          onToggle={(topicId, enabled) =>
            void push.updatePreferences({ topics: { [topicId]: enabled } })
          }
        />
      </div>

      {push.message && <p className="text-xs text-paper-soft">{push.message}</p>}
      {push.error && <p className="text-xs text-red-300">{push.error}</p>}
    </section>
  );
}
