'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type MetaStatus = {
  credentialsConfigured: boolean;
  credentialsMissing: string[];
  demoMode: boolean;
  setupInstructions: string | null;
  connectorSettings: {
    facebook: { enabled: boolean };
    instagram: { enabled: boolean };
  };
  facebook: {
    status: string;
    connection: { platformUsername: string | null; platformUserId: string | null } | null;
  };
  instagram: {
    status: string;
    connection: { platformUsername: string | null; platformUserId: string | null } | null;
  };
};

export function MetaConnectionPanel() {
  const [data, setData] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch(`${API}/api/analytics/meta/status`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<MetaStatus>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function connectMeta() {
    setBusy('connect');
    setError(null);
    try {
      const res = await fetch(`${API}/api/analytics/meta/oauth/start?format=json`);
      const json = (await res.json()) as { authorizationUrl?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? 'Meta credentials not configured');
      if (!json.authorizationUrl) throw new Error('No authorization URL');
      window.location.href = json.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
      setBusy(null);
    }
  }

  async function disconnectMeta() {
    setBusy('disconnect');
    try {
      const res = await fetch(`${API}/api/analytics/meta/disconnect`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setMessage('Meta disconnected (Facebook Page + Instagram).');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-paper-muted italic">// checking meta connection…</p>;
  }

  const metaDisabled =
    !data?.connectorSettings.facebook.enabled && !data?.connectorSettings.instagram.enabled;

  return (
    <div className="space-y-6 border-2 border-paper-edge p-6">
      <p className="text-2xs text-paper-muted">
        read-only — connects Facebook Page and linked Instagram Professional account. no publishing.
      </p>

      {metaDisabled && (
        <div className="text-xs border border-dashed border-paper-edge px-4 py-3 space-y-2">
          <p>
            Facebook and Instagram are turned off in analytics settings until business accounts are
            ready.
          </p>
          <Link href="/analytics/settings" className="bracket hover:text-accent">
            open analytics settings →
          </Link>
        </div>
      )}

      {!metaDisabled && !data?.connectorSettings.facebook.enabled && (
        <p className="text-2xs text-paper-muted border border-paper-edge px-3 py-2">
          Facebook Page is off in settings — connect will still link both; only enabled platforms
          sync and appear on the hub.
        </p>
      )}

      {!metaDisabled && !data?.connectorSettings.instagram.enabled && (
        <p className="text-2xs text-paper-muted border border-paper-edge px-3 py-2">
          Instagram is off in settings — enable it when the Professional account is ready.
        </p>
      )}

      {data?.setupInstructions && (
        <p className="text-xs text-paper-soft border border-dashed border-paper-edge px-3 py-2">
          {data.setupInstructions}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="border border-paper-edge p-3">
          <div className="text-2xs uppercase text-paper-muted">facebook page</div>
          <div className="font-bold mt-1">{data?.facebook.status ?? '—'}</div>
          {data?.facebook.connection?.platformUsername && (
            <div className="text-2xs text-paper-muted mt-1">
              {data.facebook.connection.platformUsername}
            </div>
          )}
        </div>
        <div className="border border-paper-edge p-3">
          <div className="text-2xs uppercase text-paper-muted">instagram</div>
          <div className="font-bold mt-1">{data?.instagram.status ?? '—'}</div>
          {data?.instagram.connection?.platformUsername && (
            <div className="text-2xs text-paper-muted mt-1">
              @{data.instagram.connection.platformUsername}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-2xs text-accent">// {error}</p>}
      {message && <p className="text-2xs text-paper-soft">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={Boolean(busy) || metaDisabled || data?.facebook.status === 'credentials_missing'}
          onClick={() => void connectMeta()}
          className="min-h-[44px] border-2 border-paper-ink px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {busy === 'connect' ? 'redirecting…' : 'connect facebook + instagram'}
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void disconnectMeta()}
          className="min-h-[44px] border border-paper-edge px-4 py-2 text-sm disabled:opacity-50"
        >
          disconnect
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void reload()}
          className="min-h-[44px] border border-paper-edge px-4 py-2 text-sm"
        >
          check status
        </button>
        <Link href="/analytics/settings" className="min-h-[44px] inline-flex items-center px-4 text-sm bracket">
          analytics settings →
        </Link>
      </div>
    </div>
  );
}
