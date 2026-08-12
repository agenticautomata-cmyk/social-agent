'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../../lib/client-api';

type GoogleCalStatus = {
  status: string;
  calendarAuthorized: boolean;
  hasValidTokens?: boolean;
  canRetryProvisioning?: boolean;
  credentialsConfigured: boolean;
  setupInstructions: string | null;
  oauthPublishingStatus?: 'testing' | 'production';
  refreshTokenExpiresAt?: string | null;
  healthWarnings?: string[];
  productionPublishingRecommendation?: string | null;
  connection: {
    email: string | null;
    connectedAt: string | null;
    expiresAt: string | null;
    lastError: string | null;
    selectedCalendarId: string | null;
    selectedCalendarName: string | null;
    dedicatedCalendarId: string | null;
    dedicatedCalendarName: string | null;
    lastSuccessfulSyncAt: string | null;
    lastFailedSyncAt: string | null;
    availabilityEnabled: boolean;
  } | null;
};

export function GoogleCalendarConnectionPanel() {
  const [data, setData] = useState<GoogleCalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch(clientApiUrl('/api/calendar/google/status'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<GoogleCalStatus>;
      })
      .then((status) => {
        setData(status);
        if (status.calendarAuthorized) {
          setError(null);
          setMessage((prev) => prev ?? 'Google Calendar connected and verified via Calendar API.');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('googleConnected') === '1') {
      void reload();
    }
    if (params.get('googleError') === '1') {
      setError(decodeURIComponent((params.get('message') ?? 'Connection failed').replace(/\+/g, ' ')));
      void reload();
    }
    if (params.get('googleConnected') || params.get('googleError')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('googleConnected');
      url.searchParams.delete('googleError');
      url.searchParams.delete('message');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [reload]);

  async function connect() {
    setBusy('connect');
    try {
      const res = await fetch(clientApiUrl('/api/calendar/google/oauth/start?format=json'));
      const json = (await res.json()) as { authorizationUrl?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? 'Credentials not configured');
      if (!json.authorizationUrl) throw new Error('No authorization URL');
      window.location.href = json.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
      setBusy(null);
    }
  }

  async function retryProvisioning() {
    setBusy('retry');
    try {
      const res = await fetch(clientApiUrl('/api/calendar/google/retry-provisioning'), { method: 'POST' });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Retry failed');
      setMessage('Dedicated calendar provisioned successfully.');
      setError(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy('sync');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(clientApiUrl('/api/calendar/google/sync'), { method: 'POST' });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        exported?: number;
        updated?: number;
        removed?: number;
        failed?: number;
        skipped?: number;
        errors?: Array<{ title: string; error: string }>;
      };
      if (!res.ok && json.error) throw new Error(json.error);
      const exported = json.exported ?? 0;
      const updated = json.updated ?? 0;
      const removed = json.removed ?? 0;
      const failed = json.failed ?? 0;
      const skipped = json.skipped ?? 0;
      if (failed > 0 && exported + updated + removed === 0) {
        const first = json.errors?.[0];
        throw new Error(first ? `${first.title}: ${first.error}` : 'Calendar sync failed');
      }
      const parts = [
        exported > 0 ? `${exported} exported` : null,
        updated > 0 ? `${updated} updated` : null,
        removed > 0 ? `${removed} removed` : null,
        skipped > 0 ? `${skipped} skipped` : null,
        failed > 0 ? `${failed} failed` : null,
      ].filter(Boolean);
      setMessage(
        parts.length > 0
          ? `Calendar sync complete — ${parts.join(', ')}.`
          : 'Calendar sync complete — nothing pending.',
      );
      if (failed > 0 && json.errors?.[0]) {
        setError(`${json.errors[0].title}: ${json.errors[0].error}`);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      await fetch(clientApiUrl('/api/calendar/google/disconnect'), { method: 'POST' });
      setMessage('Google Calendar disconnected.');
      await reload();
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-paper-muted italic">// checking google calendar…</p>;
  }

  const showConnect = !data?.calendarAuthorized && !data?.hasValidTokens;

  return (
    <div className="space-y-6 border-2 border-paper-edge p-6">
      <p className="text-2xs text-paper-muted">
        Gmail and Google Calendar are authorized separately. Benson uses one dedicated Google calendar:
        KC Kellie — Benson.
      </p>
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 text-sm">
        <div>
          <p className="font-semibold">Authorization</p>
          <p>{data?.calendarAuthorized ? 'Connected' : data?.status ?? 'Unknown'}</p>
          {data?.calendarAuthorized && (
            <p className="text-paper-muted text-2xs">Account email is not verified by Calendar OAuth.</p>
          )}
        </div>
        <div>
          <p className="font-semibold">Dedicated calendar</p>
          <p>{data?.connection?.dedicatedCalendarName ?? 'KC Kellie — Benson (pending setup)'}</p>
        </div>
        <div>
          <p className="font-semibold">Last successful sync</p>
          <p>{data?.connection?.lastSuccessfulSyncAt ?? '—'}</p>
        </div>
        <div>
          <p className="font-semibold">Last failed sync</p>
          <p>{data?.connection?.lastFailedSyncAt ?? '—'}</p>
          {data?.connection?.lastError && <p className="text-2xs text-red-600">{data.connection.lastError}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {showConnect ? (
          <button type="button" disabled={!!busy} onClick={() => void connect()} className="btn-primary">
            Connect Google Calendar
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void syncNow()}
              className="btn-primary"
            >
              {busy === 'sync' ? 'Syncing…' : 'Sync calendar'}
            </button>
            {data?.canRetryProvisioning && (
              <button type="button" disabled={!!busy} onClick={() => void retryProvisioning()} className="bracket">
                Retry calendar setup
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={() => void disconnect()} className="bracket">
              Disconnect Calendar
            </button>
          </>
        )}
        <Link href="/calendar" className="bracket self-center">
          ← Back to calendar
        </Link>
      </div>

      {data?.healthWarnings && data.healthWarnings.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">Calendar connection health</p>
          {data.healthWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {data.productionPublishingRecommendation && (
            <p className="text-2xs">{data.productionPublishingRecommendation}</p>
          )}
        </div>
      )}

      {data?.setupInstructions && (
        <p className="text-sm text-paper-muted italic">{data.setupInstructions}</p>
      )}
    </div>
  );
}
