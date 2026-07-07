'use client';

import { usePushNotifications } from '../lib/use-push-notifications';
import { clientApiUrl } from '../lib/client-api';
import { PushTopicChecklist } from './push-topic-checklist';

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

export function PushNotificationsPanel() {
  const push = usePushNotifications();

  if (push.loading) {
    return <p className="text-sm text-paper-muted">Loading notification settings…</p>;
  }

  const canEnable = push.pushCapable && push.permission !== 'denied';

  return (
    <div className="space-y-6">
      {!push.supported && (
        <p className="text-sm text-amber-200 border border-amber-400/30 bg-amber-400/10 rounded-xl px-4 py-3">
          Push notifications need a browser that supports the Web Push API (Chrome, Edge, Firefox,
          or installed Benson PWA on iOS 16.4+).
        </p>
      )}

      {push.ios && !push.standalone && (
        <p className="text-sm text-amber-200 border border-amber-400/30 bg-amber-400/10 rounded-xl px-4 py-3">
          On iPhone, open Benson from your Home Screen icon — not Safari — to enable push
          notifications.
        </p>
      )}

      {push.permission === 'denied' && (
        <section className="space-y-2 text-sm text-paper-soft border border-amber-400/30 bg-amber-400/10 rounded-xl px-4 py-3">
          <p className="font-medium text-amber-100">Notifications blocked on this device</p>
          <ol className="list-decimal pl-5 space-y-1 text-xs">
            <li>Open iOS Settings → Notifications</li>
            <li>Select Benson (appears after you tap Allow once)</li>
            <li>Turn on Allow Notifications</li>
            <li>Return to Benson from your Home Screen icon</li>
          </ol>
        </section>
      )}

      {!push.configured && (
        <p className="text-sm text-paper-muted border border-dashed border-paper-edge rounded-xl px-4 py-3">
          Server push keys are not configured yet. Add VAPID keys to `.env` and restart the API.
        </p>
      )}

      <section className="glass-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Device notifications</h2>
            <p className="text-xs text-paper-muted mt-1">
              {push.deviceRegistered
                ? 'This device is registered for push'
                : push.permission === 'denied'
                  ? 'Blocked — reset in iOS Settings'
                  : 'Not registered on this device yet'}
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
            <button
              type="button"
              disabled={push.busy || !push.deviceRegistered}
              onClick={() => void push.sendTest()}
              className="btn-ghost text-xs py-2 min-h-[36px] disabled:opacity-50"
            >
              Send test
            </button>
          </div>
        </div>

        <div className="text-xs font-mono border border-paper-edge rounded-lg px-3 py-2 space-y-1 text-paper-muted">
          <p>
            installed app: <span className="text-paper-soft">{push.standalone ? 'yes' : 'no'}</span>
          </p>
          <p>
            Notification.permission:{' '}
            <span className="text-paper-soft">{permissionLabel(push.permission)}</span>
          </p>
          <p>
            push subscription:{' '}
            <span className="text-paper-soft">
              {push.deviceRegistered ? 'active' : 'none'}
            </span>
          </p>
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={push.preferences?.masterEnabled ?? true}
            disabled={push.busy}
            onChange={(e) =>
              void push.updatePreferences({ masterEnabled: e.target.checked })
            }
            className="h-4 w-4 accent-accent"
          />
          <span>Allow Benson push notifications</span>
        </label>
      </section>

      <section className="glass-panel p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">What to push</h2>
          <p className="text-xs text-paper-muted mt-1">
            Choose which updates Benson should send to your devices.
          </p>
        </div>

        <ul className="space-y-3">
          <PushTopicChecklist
            topics={push.topics}
            selected={push.preferences?.topics ?? {}}
            masterEnabled={push.preferences?.masterEnabled ?? true}
            disabled={push.busy || !push.preferences?.masterEnabled}
            onToggle={(topicId, enabled) =>
              void push.updatePreferences({ topics: { [topicId]: enabled } })
            }
          />
        </ul>
      </section>

      <section className="glass-panel-strong gradient-border p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold gradient-text">5,000 followers 🎆</h2>
          <p className="text-xs text-paper-muted mt-1">
            Benson&apos;s first celebration — fireworks in the app, push notification, and a
            three-GIF Telegram blast when you cross 5K. Preview below or force-send a test.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={push.busy}
            onClick={() => {
              void (async () => {
                try {
                  const res = await fetch(
                    clientApiUrl('/api/push/milestone/followers-5000'),
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ followerCount: 5000, force: true }),
                    },
                  );
                  const json = (await res.json()) as {
                    ok: boolean;
                    sent?: boolean;
                    reason?: string;
                    error?: string;
                  };
                  if (!res.ok || !json.ok) throw new Error(json.error ?? 'Celebration failed');
                  window.location.href = '/home?celebrate=followers-5000';
                } catch {
                  push.reload();
                }
              })();
            }}
            className="btn-primary text-xs py-2 min-h-[36px] disabled:opacity-50"
          >
            Send celebration push
          </button>
          <button
            type="button"
            disabled={push.busy}
            onClick={() => {
              window.location.href = '/home?celebrate=followers-5000';
            }}
            className="btn-ghost text-xs py-2 min-h-[36px]"
          >
            Preview fireworks
          </button>
        </div>
      </section>

      {push.error && <p className="text-sm text-red-300">{push.error}</p>}
      {push.message && <p className="text-sm text-paper-soft">{push.message}</p>}
    </div>
  );
}
