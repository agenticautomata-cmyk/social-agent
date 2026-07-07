'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../../lib/client-api';
import { formatDateTime } from '../../../lib/datetime';

type InboundMessage = {
  id: string;
  gmailMessageId: string;
  gmailThreadId: string;
  outreachEmailId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  matchKind: string;
  isRead: boolean;
  businessName: string | null;
  createdAt: string;
};

type InboxResponse = {
  messages: InboundMessage[];
  unreadCount: number;
  syncStatus: {
    lastInboxSyncAt: string | null;
    lastDigestAt: string | null;
    digestEnabled: boolean;
  };
};

export function EmailInboxPanel() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(clientApiUrl('/api/outreach/inbox'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<InboxResponse>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function syncNow() {
    setBusy('sync');
    try {
      const res = await fetch(clientApiUrl('/api/outreach/inbox/sync'), { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(null);
    }
  }

  async function markRead(id: string) {
    setBusy(id);
    try {
      const res = await fetch(clientApiUrl(`/api/outreach/inbox/${id}/read`), { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mark read failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-paper-muted italic">// loading inbox…</p>;
  }

  const messages = data?.messages ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          unread: <strong>{unread}</strong>
        </span>
        {data?.syncStatus.lastInboxSyncAt && (
          <span className="text-paper-muted text-xs">
            last sync {formatDateTime(data.syncStatus.lastInboxSyncAt)}
          </span>
        )}
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={busy !== null}
          onClick={() => void syncNow()}
        >
          {busy === 'sync' ? 'syncing…' : 'sync now'}
        </button>
      </div>

      {data?.syncStatus.digestEnabled && (
        <p className="text-2xs text-paper-muted">
          Primary inbox summaries go to Telegram every ~45 min when there&apos;s new unread mail.
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {messages.length === 0 ? (
        <p className="text-sm text-paper-muted border border-dashed border-paper-edge p-6">
          No sponsor replies tracked yet. After you send approved pitches, Benson watches those Gmail threads and
          alerts you here (and on Telegram).
        </p>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`border-2 p-5 space-y-2 ${msg.isRead ? 'border-paper-edge opacity-80' : 'border-accent/40'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-bold">
                    {msg.businessName ?? msg.fromName ?? msg.fromEmail ?? 'Unknown sender'}
                  </div>
                  <div className="text-sm text-paper-muted">{msg.subject ?? '(no subject)'}</div>
                </div>
                <div className="text-2xs text-paper-muted">
                  {msg.receivedAt ? formatDateTime(msg.receivedAt) : ''}
                </div>
              </div>
              {msg.snippet && <p className="text-sm">{msg.snippet}</p>}
              <div className="flex flex-wrap gap-3 text-xs">
                {!msg.isRead && (
                  <button
                    type="button"
                    className="bracket hover:text-accent"
                    disabled={busy !== null}
                    onClick={() => void markRead(msg.id)}
                  >
                    mark read
                  </button>
                )}
                {msg.outreachEmailId && (
                  <Link href={`/email/approvals?id=${msg.outreachEmailId}`} className="bracket hover:text-accent">
                    view pitch →
                  </Link>
                )}
                <Link href="/sponsors" className="bracket hover:text-accent">
                  sponsors →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
