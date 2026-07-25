'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../lib/client-api';

type GmailStatus = {
  status: string;
  credentialsConfigured: boolean;
  credentialsMissing: string[];
  setupInstructions: string | null;
  connection: {
    email: string | null;
    connectedAt: string | null;
    expiresAt: string | null;
    lastError: string | null;
  } | null;
};

export function GmailConnectionPanel() {
  const [data, setData] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch(clientApiUrl('/api/outreach/gmail/status'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<GmailStatus>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get('gmail');
    const messageParam = params.get('message');
    const email = params.get('email');
    if (gmail === 'connected' && email) {
      setMessage(`Gmail connected as ${email}.`);
      setError(null);
      void reload();
    } else if (gmail === 'error' && messageParam) {
      setError(decodeURIComponent(messageParam.replace(/\+/g, ' ')));
    }
    if (gmail) {
      const url = new URL(window.location.href);
      url.searchParams.delete('gmail');
      url.searchParams.delete('message');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [reload]);

  async function connectGmail() {
    setBusy('connect');
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/outreach/gmail/oauth/start?format=json'));
      const json = (await res.json()) as { authorizationUrl?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? 'Gmail credentials not configured');
      if (!json.authorizationUrl) throw new Error('No authorization URL');
      window.location.href = json.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
      setBusy(null);
    }
  }

  async function disconnectGmail() {
    setBusy('disconnect');
    try {
      const res = await fetch(clientApiUrl('/api/outreach/gmail/disconnect'), { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setMessage('Gmail disconnected.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-paper-muted italic">// checking gmail connection…</p>;
  }

  return (
    <div className="space-y-6 border-2 border-paper-edge p-6">
      <p className="text-sm"><Link href="/my-info" className="bracket hover:text-accent">my info — routed addresses →</Link></p>
      <p className="text-2xs text-paper-muted">
        send + monitor — Benson sends approved pitches and watches Gmail for sponsor replies (Telegram digest for Primary mail).
      </p>

      {data?.setupInstructions && (
        <div className="text-xs border border-dashed border-paper-edge px-4 py-3">{data.setupInstructions}</div>
      )}

      {message && <p className="text-xs text-accent">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid gap-3 text-sm">
        <div>
          status: <span className="font-bold">{data?.status ?? 'unknown'}</span>
        </div>
        {data?.connection?.email && <div>account: {data.connection.email}</div>}
        {data?.connection?.lastError && (
          <div className="text-red-600">last error: {data.connection.lastError}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={busy !== null || !data?.credentialsConfigured}
          onClick={() => void connectGmail()}
        >
          {busy === 'connect' ? 'connecting…' : 'connect gmail'}
        </button>
        {data?.status === 'connected' && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() => void disconnectGmail()}
          >
            disconnect
          </button>
        )}
        {(data?.status === 'expired' || data?.status === 'error') && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy !== null || !data?.credentialsConfigured}
            onClick={() => void connectGmail()}
          >
            {busy === 'connect' ? 'reconnecting…' : 'reconnect gmail'}
          </button>
        )}
      </div>
    </div>
  );
}
