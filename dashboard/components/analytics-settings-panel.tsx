'use client';

import { clientApiOrigin } from '../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const API = clientApiOrigin();

type ConnectorSettings = {
  facebook: { enabled: boolean };
  instagram: { enabled: boolean };
  youtube: { enabled: boolean };
};

const PROVIDER_LABELS: Record<'facebook' | 'instagram' | 'youtube', string> = {
  facebook: 'Facebook Page',
  instagram: 'Instagram',
  youtube: 'YouTube Shorts',
};

export function AnalyticsSettingsPanel() {
  const [settings, setSettings] = useState<ConnectorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/analytics/settings`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<{ settings: ConnectorSettings }>;
      })
      .then((json) => setSettings(json.settings))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggle(provider: 'facebook' | 'instagram' | 'youtube', enabled: boolean) {
    setBusy(provider);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${API}/api/analytics/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [provider]: enabled }),
      });
      const json = (await res.json()) as { settings?: ConnectorSettings; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Update failed');
      setSettings(json.settings ?? null);
      setMessage(
        enabled
          ? `${PROVIDER_LABELS[provider]} enabled — connect and sync when ready.`
          : `${PROVIDER_LABELS[provider]} hidden until you turn it back on.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !settings) {
    return <p className="text-sm text-paper-muted italic">// loading settings…</p>;
  }

  return (
    <div className="space-y-6 border-2 border-paper-edge p-6 max-w-xl">
      <p className="text-sm text-paper-soft leading-relaxed">
        Facebook, Instagram, and YouTube Shorts stay off until Kellie has the right business accounts
        set up. TikTok stays on.
      </p>

      {error && <p className="text-2xs text-accent">// {error}</p>}
      {message && <p className="text-2xs text-paper-soft">{message}</p>}

      <div className="space-y-4">
        <ToggleRow
          label="Facebook Page analytics"
          description="Page insights via Meta — requires a Facebook business Page."
          enabled={settings?.facebook.enabled ?? false}
          busy={busy === 'facebook'}
          onChange={(v) => void toggle('facebook', v)}
        />
        <ToggleRow
          label="Instagram Professional analytics"
          description="Reels and post metrics — requires Instagram Professional linked to a Page."
          enabled={settings?.instagram.enabled ?? false}
          busy={busy === 'instagram'}
          onChange={(v) => void toggle('instagram', v)}
        />
        <ToggleRow
          label="YouTube Shorts analytics"
          description="Short-form video metrics — OAuth not wired yet; hide until you are ready."
          enabled={settings?.youtube.enabled ?? false}
          busy={busy === 'youtube'}
          onChange={(v) => void toggle('youtube', v)}
        />
      </div>

      <div className="flex flex-wrap gap-3 pt-2 text-sm">
        <Link href="/analytics/meta/settings" className="bracket hover:text-accent">
          meta connection →
        </Link>
        <Link href="/analytics/tiktok" className="bracket hover:text-accent">
          analytics hub →
        </Link>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  busy,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  busy: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border border-paper-edge p-4">
      <div className="space-y-1 min-w-0">
        <div className="text-sm font-bold lowercase">{label.toLowerCase()}</div>
        <p className="text-2xs text-paper-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={() => onChange(!enabled)}
        className={`shrink-0 min-h-[44px] min-w-[88px] border-2 px-3 py-2 text-2xs font-bold uppercase tracking-wider disabled:opacity-50 ${
          enabled ? 'border-paper-ink bg-paper-tint' : 'border-paper-edge text-paper-muted'
        }`}
      >
        {busy ? '…' : enabled ? 'on' : 'off'}
      </button>
    </div>
  );
}

export function AnalyticsSettingsGearLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/analytics/settings"
      className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] border-2 border-paper-edge hover:border-paper-ink transition ${className}`}
      aria-label="Analytics settings"
      title="Analytics settings"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        />
      </svg>
    </Link>
  );
}
