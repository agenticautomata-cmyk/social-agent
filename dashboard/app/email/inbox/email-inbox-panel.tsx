'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../../lib/client-api';
import { formatDateTime } from '../../../lib/datetime';

type InboxFilter =
  | 'all'
  | 'discovery'
  | 'sponsor'
  | 'collaboration'
  | 'booking'
  | 'media'
  | 'general_contact'
  | 'security'
  | 'subscription_confirmation';

type UnifiedMessage = {
  id: string;
  source: string;
  gmailMessageId: string;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  emailCategory: string;
  discoveryIntent: string | null;
  channelId: string | null;
  originalRecipient: string | null;
  matchedHeader: string | null;
  isRead: boolean;
  businessName: string | null;
  outreachEmailId: string | null;
  actionStatus?: string | null;
  promotedContentItemId?: string | null;
  processingStatus?: string | null;
};

type InboxResponse = {
  messages: UnifiedMessage[];
  unreadCount: number;
  unreadByCategory: Record<string, number>;
  syncStatus: {
    lastInboxSyncAt: string | null;
    lastDigestAt: string | null;
    digestEnabled: boolean;
  };
};

const FILTERS: Array<{ id: InboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'subscription_confirmation', label: 'Subscription confirmation' },
  { id: 'sponsor', label: 'Sponsor' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'booking', label: 'Booking' },
  { id: 'media', label: 'Media' },
  { id: 'general_contact', label: 'Contact' },
  { id: 'security', label: 'Security' },
];

const FOLLOW_UP_CATEGORIES = new Set(['sponsor', 'collaboration', 'booking', 'media', 'general_contact']);

function categoryLabel(msg: UnifiedMessage): string {
  if (msg.discoveryIntent === 'discovery_subscription_confirmation') return 'subscription confirmation';
  return msg.emailCategory.replace(/_/g, ' ');
}

function actionStatusLabel(status: string | null | undefined): string | null {
  if (!status || status === 'open') return null;
  if (status === 'promoted_opportunity') return 'added to inventory';
  if (status === 'promoted_sponsor') return 'queued for follow-up';
  if (status === 'dismissed') return 'dismissed';
  return status.replace(/_/g, ' ');
}

export function EmailInboxPanel() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = filter === 'all' ? '' : `?category=${encodeURIComponent(filter)}`;
    return fetch(clientApiUrl(`/api/outreach/inbox${params}`), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<InboxResponse>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function syncNow() {
    setBusy('sync');
    setNotice(null);
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

  async function runDigest() {
    setBusy('digest');
    setNotice(null);
    try {
      const res = await fetch(clientApiUrl('/api/outreach/inbox/digest'), { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as {
        newMessages?: number;
        autoHarvested?: number;
        telegramSent?: boolean;
      };
      setNotice(
        `Digest scanned ${json.newMessages ?? 0} new messages` +
          (json.autoHarvested ? ` · auto-harvested ${json.autoHarvested} opportunities` : '') +
          (json.telegramSent ? ' · Telegram sent' : ''),
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Digest failed');
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

  async function promoteOpportunity(gmailMessageId: string) {
    setBusy(`opp-${gmailMessageId}`);
    setNotice(null);
    try {
      const res = await fetch(clientApiUrl(`/api/outreach/inbox/${gmailMessageId}/promote-opportunity`), {
        method: 'POST',
      });
      const json = (await res.json()) as { inventoryUrl?: string; reason?: string };
      if (!res.ok) throw new Error(json.reason ?? 'Promote failed');
      setNotice(json.inventoryUrl ? 'Added to inventory' : 'Already linked to inventory');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promote failed');
    } finally {
      setBusy(null);
    }
  }

  async function promoteFollowUp(gmailMessageId: string) {
    setBusy(`follow-${gmailMessageId}`);
    setNotice(null);
    try {
      const res = await fetch(clientApiUrl(`/api/outreach/inbox/${gmailMessageId}/promote-follow-up`), {
        method: 'POST',
      });
      const json = (await res.json()) as { reason?: string };
      if (!res.ok) throw new Error(json.reason ?? 'Follow-up failed');
      setNotice('Queued for follow-up in inbox');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Follow-up failed');
    } finally {
      setBusy(null);
    }
  }

  async function dismissMessage(gmailMessageId: string) {
    setBusy(`dismiss-${gmailMessageId}`);
    try {
      const res = await fetch(clientApiUrl(`/api/outreach/inbox/${gmailMessageId}/dismiss`), {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-paper-muted italic">// loading inbox…</p>;
  }

  const messages = data?.messages ?? [];
  const sponsorUnread = data?.unreadCount ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          sponsor unread: <strong>{sponsorUnread}</strong>
        </span>
        {data?.syncStatus.lastInboxSyncAt && (
          <span className="text-paper-muted text-xs">
            last sync {formatDateTime(data.syncStatus.lastInboxSyncAt)}
          </span>
        )}
        {data?.syncStatus.lastDigestAt && (
          <span className="text-paper-muted text-xs">
            last digest {formatDateTime(data.syncStatus.lastDigestAt)}
          </span>
        )}
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={busy !== null}
          onClick={() => void syncNow()}
        >
          {busy === 'sync' ? 'syncing…' : 'sync pitches'}
        </button>
        {data?.syncStatus.digestEnabled && (
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={busy !== null}
            onClick={() => void runDigest()}
          >
            {busy === 'digest' ? 'digesting…' : 'run digest now'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`text-2xs border px-2 py-1 ${
              filter === item.id ? 'border-paper-ink font-bold' : 'border-paper-edge'
            }`}
          >
            {item.label}
            {item.id !== 'all' && data?.unreadByCategory[item.id]
              ? ` (${data.unreadByCategory[item.id]})`
              : ''}
          </button>
        ))}
      </div>

      {data?.syncStatus.digestEnabled && (
        <p className="text-2xs text-paper-muted">
          Digests now scan Primary + Promotions unread mail from the last 14 days. Opportunity-shaped
          messages auto-harvest into inventory; you can also promote any digest row manually.
        </p>
      )}

      {notice && <p className="text-xs text-emerald-700">{notice}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {messages.length === 0 ? (
        <p className="text-sm text-paper-muted border border-dashed border-paper-edge p-6">
          No messages in this category yet.
        </p>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => {
            const status = actionStatusLabel(msg.actionStatus ?? msg.processingStatus);
            const canPromoteOpp =
              msg.source === 'gmail_digest' &&
              (msg.actionStatus ?? 'open') === 'open' &&
              !msg.promotedContentItemId;
            const canFollowUp =
              canPromoteOpp && FOLLOW_UP_CATEGORIES.has(msg.emailCategory);
            const canDismiss =
              msg.source === 'gmail_digest' && (msg.actionStatus ?? 'open') === 'open';

            return (
              <div
                key={`${msg.source}-${msg.id}`}
                className={`border-2 p-5 space-y-2 ${msg.isRead ? 'border-paper-edge opacity-80' : 'border-accent/40'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-2xs uppercase text-paper-muted">
                      {categoryLabel(msg)}
                      {status ? ` · ${status}` : ''}
                    </div>
                    <div className="font-bold">
                      {msg.businessName ?? msg.fromName ?? msg.fromEmail ?? 'Unknown sender'}
                    </div>
                    <div className="text-sm text-paper-muted">{msg.subject ?? '(no subject)'}</div>
                    {msg.originalRecipient && (
                      <div className="text-2xs text-paper-dim mt-1">
                        to: {msg.originalRecipient}
                        {msg.matchedHeader ? ` · via ${msg.matchedHeader}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="text-2xs text-paper-muted">
                    {msg.receivedAt ? formatDateTime(msg.receivedAt) : ''}
                  </div>
                </div>
                {msg.snippet && <p className="text-sm">{msg.snippet}</p>}
                <div className="flex flex-wrap gap-3 text-xs">
                  {!msg.isRead && msg.source === 'outreach_reply' && (
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
                  {msg.promotedContentItemId && (
                    <Link
                      href={`/review/inventory?selected=${msg.promotedContentItemId}`}
                      className="bracket hover:text-accent"
                    >
                      open in inventory →
                    </Link>
                  )}
                  {canPromoteOpp && (
                    <button
                      type="button"
                      className="bracket hover:text-accent"
                      disabled={busy !== null}
                      onClick={() => void promoteOpportunity(msg.gmailMessageId)}
                    >
                      add to inventory
                    </button>
                  )}
                  {canFollowUp && (
                    <button
                      type="button"
                      className="bracket hover:text-accent"
                      disabled={busy !== null}
                      onClick={() => void promoteFollowUp(msg.gmailMessageId)}
                    >
                      queue follow-up
                    </button>
                  )}
                  {canDismiss && (
                    <button
                      type="button"
                      className="bracket hover:text-accent"
                      disabled={busy !== null}
                      onClick={() => void dismissMessage(msg.gmailMessageId)}
                    >
                      dismiss
                    </button>
                  )}
                  {msg.emailCategory === 'discovery' && (
                    <Link href="/sources" className="bracket hover:text-accent">
                      discovery subscriptions →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
