'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  statusLabel,
  type TikTokConnectionStatusResponse,
} from '../lib/tiktok-oauth-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function TikTokConnectionPanel({
  showSetupDetails = false,
  onStatusChange,
}: {
  showSetupDetails?: boolean;
  onStatusChange?: (status: TikTokConnectionStatusResponse) => void;
}) {
  const [data, setData] = useState<TikTokConnectionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/analytics/tiktok/status`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<TikTokConnectionStatusResponse>;
      })
      .then((json) => {
        setData(json);
        onStatusChange?.(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load status'))
      .finally(() => setLoading(false));
  }, [onStatusChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function connectTikTok() {
    setBusy('connect');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/analytics/tiktok/oauth/start?format=json`);
      const json = (await res.json()) as {
        authorizationUrl?: string;
        error?: string;
        message?: string;
        missing?: string[];
      };
      if (!res.ok) {
        throw new Error(json.message ?? json.error ?? 'TikTok API credentials are not configured yet.');
      }
      if (!json.authorizationUrl) {
        throw new Error('No authorization URL returned');
      }
      window.location.href = json.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
      setBusy(null);
    }
  }

  async function disconnectTikTok() {
    setBusy('disconnect');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/analytics/tiktok/disconnect`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { alreadyDisconnected?: boolean };
      setMessage(
        json.alreadyDisconnected
          ? 'No active TikTok connection — already disconnected.'
          : 'TikTok disconnected.',
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-paper-muted italic">// checking tiktok connection…</p>;
  }

  const credentialsMissing = data?.status === 'credentials_missing';

  return (
    <div className="space-y-6 border-2 border-paper-edge p-6">
      {data?.demoMode && (
        <p className="text-xs text-paper-muted border border-dashed border-paper-edge px-3 py-2">
          demo mode — manual CSV import and sample analytics still work without OAuth.
        </p>
      )}

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// {error}</div>
      )}
      {message && (
        <div className="border border-paper-edge px-4 py-2 text-xs text-paper-muted">{message}</div>
      )}

      {credentialsMissing && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-paper-ink">
            TikTok API credentials are not configured yet.
          </p>
          {showSetupDetails && (
            <div className="text-xs text-paper-soft space-y-2">
              <p>{data?.setupInstructions}</p>
              <p className="font-mono text-2xs text-paper-muted">
                TIKTOK_CLIENT_KEY · TIKTOK_CLIENT_SECRET · TIKTOK_REDIRECT_URI
              </p>
              <p className="text-paper-muted italic">
                Register the redirect URI in the TikTok Developer Portal, then restart the API.
              </p>
            </div>
          )}
        </div>
      )}

      {data && !credentialsMissing && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-paper-muted">
            <span>status: {statusLabel(data.status)}</span>
            {data.connection?.platformUsername && (
              <span>@{data.connection.platformUsername}</span>
            )}
            {data.connection?.connectedAt && (
              <span>
                connected {new Date(data.connection.connectedAt).toLocaleString()}
              </span>
            )}
          </div>
          {data.connection?.scopes && data.connection.scopes.length > 0 && (
            <p className="text-2xs text-paper-muted">
              scopes: {data.connection.scopes.join(', ')}
            </p>
          )}
          {data.connection?.expiresAt && (
            <p className="text-2xs text-paper-muted">
              token expires {new Date(data.connection.expiresAt).toLocaleString()}
            </p>
          )}
          {data.connection?.lastError && data.status === 'error' && (
            <p className="text-2xs text-accent">last error: {data.connection.lastError}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!!busy || credentialsMissing || data?.status === 'connected'}
          onClick={() => void connectTikTok()}
          className="border-2 border-paper-ink px-4 py-2 text-sm font-bold lowercase hover:bg-paper-ink hover:text-paper disabled:opacity-40"
        >
          {busy === 'connect' ? '…' : 'connect tiktok'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void reload()}
          className="border border-paper-edge px-4 py-2 text-sm hover:border-paper-ink disabled:opacity-40"
        >
          {busy === 'status' ? '…' : 'check connection status'}
        </button>
        <button
          type="button"
          disabled={!!busy || credentialsMissing}
          onClick={() => void disconnectTikTok()}
          className="border border-paper-edge px-4 py-2 text-sm hover:border-paper-ink disabled:opacity-40"
        >
          {busy === 'disconnect' ? '…' : 'disconnect tiktok'}
        </button>
      </div>

      <p className="text-2xs text-paper-muted italic max-w-2xl">
        Phase B prepares OAuth only — video sync and advanced metrics require TikTok scope approval.
        Manual CSV import remains available at{' '}
        <Link href="/analytics/import" className="underline hover:text-accent">
          /analytics/import
        </Link>
        .
      </p>
    </div>
  );
}
