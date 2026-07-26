'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../../lib/client-api';

type GoogleCalStatus = {
  status: string;
  calendarAuthorized: boolean;
  credentialsConfigured: boolean;
  setupInstructions: string | null;
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
  const [calendars, setCalendars] = useState<Array<{ id: string; name: string; primary: boolean }>>([]);
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
      .then(async (status) => {
        setData(status);
        if (status.calendarAuthorized) {
          const calRes = await fetch(clientApiUrl('/api/calendar/google/calendars'), { cache: 'no-store' });
          if (calRes.ok) {
            const calJson = (await calRes.json()) as { calendars: Array<{ id: string; name: string; primary: boolean }> };
            setCalendars(calJson.calendars);
          }
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
      setMessage(`Google Calendar connected${params.get('email') ? ` as ${params.get('email')}` : ''}.`);
      void reload();
    }
    if (params.get('googleError') === '1') {
      setError(decodeURIComponent((params.get('message') ?? 'Connection failed').replace(/\+/g, ' ')));
    }
    if (params.get('googleConnected') || params.get('googleError')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('googleConnected');
      url.searchParams.delete('googleError');
      url.searchParams.delete('message');
      url.searchParams.delete('email');
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

  async function ensureDedicated() {
    setBusy('dedicated');
    try {
      const res = await fetch(clientApiUrl('/api/calendar/google/dedicated-calendar'), { method: 'POST' });
      const json = (await res.json()) as { name?: string; created?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setMessage(json.created ? `Created "${json.name}"` : `Using existing "${json.name}"`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  async function selectCalendar(calendarId: string, calendarName: string) {
    setBusy(calendarId);
    try {
      const res = await fetch(clientApiUrl('/api/calendar/google/select-calendar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId, calendarName }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage(`Destination calendar: ${calendarName}`);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-paper-muted italic">// checking google calendar…</p>;
  }

  return (
    <div className="space-y-6 border-2 border-paper-edge p-6">
      <p className="text-2xs text-paper-muted">
        Gmail and Google Calendar are authorized separately. A connected Gmail account does not grant Calendar access.
      </p>
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 text-sm">
        <div>
          <p className="font-semibold">Authorization</p>
          <p>{data?.calendarAuthorized ? 'Connected' : data?.status ?? 'Unknown'}</p>
          {data?.connection?.email && <p className="text-paper-muted">{data.connection.email}</p>}
        </div>
        <div>
          <p className="font-semibold">Destination calendar</p>
          <p>{data?.connection?.selectedCalendarName ?? 'Not selected'}</p>
          {data?.connection?.dedicatedCalendarName && (
            <p className="text-2xs text-paper-muted">Dedicated: {data.connection.dedicatedCalendarName}</p>
          )}
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
        {!data?.calendarAuthorized ? (
          <button type="button" disabled={!!busy} onClick={() => void connect()} className="btn-primary">
            Connect Google Calendar
          </button>
        ) : (
          <>
            <button type="button" disabled={!!busy} onClick={() => void ensureDedicated()} className="btn-primary">
              Create / select KC Kellie — Benson
            </button>
            <button type="button" disabled={!!busy} onClick={() => void disconnect()} className="bracket">
              Disconnect Calendar
            </button>
          </>
        )}
        <Link href="/calendar" className="bracket self-center">
          ← Back to calendar
        </Link>
      </div>

      {data?.calendarAuthorized && calendars.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Writable calendars</p>
          <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
            {calendars.map((cal) => (
              <li key={cal.id} className="flex items-center justify-between gap-2 border border-paper-edge px-2 py-1">
                <span>
                  {cal.name}
                  {cal.primary ? ' (primary)' : ''}
                </span>
                <button
                  type="button"
                  disabled={busy === cal.id}
                  onClick={() => void selectCalendar(cal.id, cal.name)}
                  className="text-2xs bracket"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.setupInstructions && (
        <p className="text-sm text-paper-muted italic">{data.setupInstructions}</p>
      )}
    </div>
  );
}
