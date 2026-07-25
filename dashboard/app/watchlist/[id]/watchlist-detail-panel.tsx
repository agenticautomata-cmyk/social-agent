'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';

type WatchlistCard = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  platform: string;
  monitoringMode: string;
  paused: boolean;
  healthStatus: string;
  sessionStatus: string | null;
  lastSuccessfulCheck: string | null;
  fetchMethod: string | null;
};

type ScoutItem = {
  id: string;
  itemUrl: string;
  itemType: string;
  captionText: string | null;
  detectedAt: string;
  creatorValueStatus: string;
  linkedEarlySignalId: string | null;
};

export function WatchlistDetailPanel() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [item, setItem] = useState<WatchlistCard | null>(null);
  const [scoutItems, setScoutItems] = useState<ScoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch(clientApiUrl(`/api/watchlist/${id}`), { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: { ok: boolean; item?: WatchlistCard; scoutItems?: ScoutItem[] }) => {
        if (!json.ok || !json.item) throw new Error('Not found');
        setItem(json.item);
        setScoutItems(json.scoutItems ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkNow() {
    setMessage(null);
    const res = await fetch(clientApiUrl(`/api/watchlist/${id}/check-now`), { method: 'POST' });
    const json = (await res.json()) as { ok: boolean; error?: string; newItems?: number };
    setMessage(json.ok ? `Check complete — ${json.newItems ?? 0} new item(s)` : (json.error ?? 'Check failed'));
    await load();
  }

  async function togglePause(paused: boolean) {
    await fetch(clientApiUrl(`/api/watchlist/${id}/pause`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused }),
    });
    await load();
  }

  async function stopWatching() {
    await fetch(clientApiUrl(`/api/watchlist/${id}`), { method: 'DELETE' });
    router.push('/watchlist');
  }

  if (loading) return <p className="text-sm text-paper-muted italic">Loading…</p>;
  if (!item) return <p className="text-sm text-red-600">Source not found</p>;

  return (
    <div className="space-y-6">
      <Link href="/watchlist" className="btn-ghost text-xs inline-flex">
        ← Watchlist
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-bold">{item.sourceName}</h1>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-accent break-all">
          {item.sourceUrl}
        </a>
        <p className="text-xs text-paper-muted">
          {item.platform} · {item.monitoringMode.replace(/_/g, ' ').toLowerCase()}
          {item.sessionStatus === 'login_required' && ' · Login required'}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-sm" onClick={() => void checkNow()}>
          Check now
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={() => void togglePause(!item.paused)}>
          {item.paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="btn-ghost text-sm text-red-700" onClick={() => void stopWatching()}>
          Stop watching
        </button>
      </div>

      {message && <p className="text-sm text-paper-muted">{message}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">Detected items</h2>
        {scoutItems.length === 0 ? (
          <p className="text-sm text-paper-muted italic">No items detected yet.</p>
        ) : (
          <ul className="space-y-2">
            {scoutItems.map((si) => (
              <li key={si.id} className="card p-3 text-sm">
                <p className="font-medium truncate">{si.captionText ?? si.itemUrl}</p>
                <p className="text-xs text-paper-muted">
                  {new Date(si.detectedAt).toLocaleString()} · {si.creatorValueStatus}
                </p>
                {si.linkedEarlySignalId && (
                  <Link href={`/signals/${si.linkedEarlySignalId}`} className="text-xs text-accent">
                    View Early Signal →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
