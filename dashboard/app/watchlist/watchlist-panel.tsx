'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';

type WatchlistCard = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  platform: string;
  monitoringMode: string;
  enabled: boolean;
  paused: boolean;
  healthStatus: string;
  sessionStatus: string | null;
  lastSuccessfulCheck: string | null;
  lastNewItemDetected: string | null;
  qualifiedThisWeek: number;
  hiddenNoise: number;
  fetchMethod: string | null;
  nextCheckEstimate: string | null;
  displayHealth?: string;
};

function statusLabel(card: WatchlistCard): string {
  if (card.displayHealth === 'blocked' || card.sessionStatus === 'login_required') return 'Blocked';
  if (card.paused) return 'Paused';
  if (card.displayHealth === 'degraded') return 'Degraded';
  if (card.displayHealth === 'failed' || card.healthStatus === 'failed') return 'Failed';
  if (card.displayHealth === 'healthy') return 'Healthy';
  if (card.displayHealth === 'ready') return 'Ready';
  if (card.enabled) return 'Watching';
  return 'Stopped';
}

export function WatchlistPanel() {
  const [items, setItems] = useState<WatchlistCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetch(clientApiUrl('/api/watchlist'), { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: { ok: boolean; items?: WatchlistCard[]; error?: string }) => {
        if (!json.ok) throw new Error(json.error ?? 'Failed to load watchlist');
        setItems(json.items ?? []);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-paper-muted italic">Loading watchlist…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/watchlist/add" className="btn-primary text-sm py-2 px-4 min-h-[40px]">
          Add source
        </Link>
        <Link href="/signals" className="btn-ghost text-sm py-2 px-4 min-h-[40px]">
          Early Signals
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-paper-muted">
          No watched sources yet. Paste a URL once and Benson keeps checking it.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((card) => (
            <li key={card.id} className="card p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/watchlist/${card.id}`} className="font-semibold hover:text-accent">
                    {card.sourceName}
                  </Link>
                  <p className="text-xs text-paper-muted truncate max-w-md">{card.sourceUrl}</p>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-paper-muted">
                  {statusLabel(card)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-paper-muted">
                <span>{card.platform}</span>
                <span>·</span>
                <span>{card.monitoringMode.replace(/_/g, ' ').toLowerCase()}</span>
                {card.lastSuccessfulCheck && (
                  <>
                    <span>·</span>
                    <span>Last checked {new Date(card.lastSuccessfulCheck).toLocaleString()}</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
