'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AnalyticsHubSummary } from '../../lib/creator-analytics-types';
import { formatNumber } from '../../lib/creator-analytics-types';

import { formatSyncTime } from '../../lib/datetime';
import { useBensonDataRefresh } from '../../lib/benson-data-refresh';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function AnalyticsHubPanel() {
  const { notifyLocalChange } = useBensonDataRefresh();
  const [data, setData] = useState<AnalyticsHubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/analytics`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<AnalyticsHubSummary>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runSync(provider?: string) {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const res = await fetch(`${API}/api/analytics/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider ?? 'all' }),
      });
      const json = (await res.json()) as { error?: string; results?: Array<{ provider: string; ok: boolean }> };
      if (!res.ok) throw new Error(json.error ?? 'Sync failed');
      const okCount = json.results?.filter((r) => r.ok).length ?? 0;
      setSyncMsg(`Sync complete — ${okCount} provider(s) processed`);
      notifyLocalChange(['analytics', 'home_briefing', 'recommendations']);
      await reload();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-paper-muted italic">// loading analytics...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 border border-red-300 p-4">
        // analytics error: {error}
      </p>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {data.demoMode && (
        <p className="text-xs text-paper-muted border border-dashed border-paper-edge px-4 py-3">
          demo mode — read-only analytics. connect accounts or import CSV; sync aggregates live and demo data.
        </p>
      )}

      <section className="border border-paper-edge p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider">creator analytics</h2>
          <p className="text-2xs text-paper-muted mt-1">
            read-only — no posting. nightly sync + manual refresh below.
          </p>
        </div>
        <button
          type="button"
          disabled={syncBusy || data.syncInProgress}
          onClick={() => void runSync()}
          className="min-h-[44px] border-2 border-paper-ink px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {syncBusy || data.syncInProgress ? 'syncing…' : 'sync all accounts'}
        </button>
      </section>
      {syncMsg && <p className="text-xs text-paper-soft">{syncMsg}</p>}

      {data.connectors.length > 0 && (
        <section className="border border-paper-edge p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider">connected accounts</h2>
            {!data.connectorSettings.facebook.enabled ||
            !data.connectorSettings.instagram.enabled ||
            !data.connectorSettings.youtube.enabled ? (
              <Link href="/analytics/settings" className="text-2xs text-paper-muted hover:text-accent">
                platform toggles in settings →
              </Link>
            ) : null}
          </div>
          <ul className="space-y-3">
            {data.connectors.map((c) => (
              <li key={c.provider} className="border border-paper-edge p-3 text-sm space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-bold lowercase">{c.label}</span>
                  <span className="text-2xs text-paper-muted">
                    {c.connected ? c.accountStatus.replace(/_/g, ' ') : 'not connected'}
                    {c.accountName ? ` · ${c.accountName}` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-2xs text-paper-muted">
                  <span>
                    followers:{' '}
                    <strong className="text-paper-ink">
                      {c.provider === 'tiktok' && c.connected && c.followersAvailable === false
                        ? 'unavailable (API scope)'
                        : c.followers != null
                          ? formatNumber(c.followers)
                          : '—'}
                    </strong>
                  </span>
                  <span>posts: <strong className="text-paper-ink">{c.postCount != null ? String(c.postCount) : '—'}</strong></span>
                  <span>views: <strong className="text-paper-ink">{c.totalViews != null ? formatNumber(c.totalViews) : '—'}</strong></span>
                  <span>engagement: <strong className="text-paper-ink">{c.totalEngagement != null ? formatNumber(c.totalEngagement) : '—'}</strong></span>
                </div>
                <div className="flex flex-wrap gap-3 text-2xs">
                  <span>last sync: {formatSyncTime(c.lastSyncAt)}</span>
                  <span>last success: {formatSyncTime(c.lastSuccessfulSyncAt)}</span>
                  {c.lastSyncError && (
                    <span className="text-accent">error: {c.lastSyncError}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href={c.settingsHref} className="bracket text-2xs hover:text-accent">
                    connection settings →
                  </Link>
                  {c.connected && (
                    <button
                      type="button"
                      disabled={syncBusy}
                      onClick={() => void runSync(c.provider)}
                      className="text-2xs border border-paper-edge px-2 py-0.5 hover:border-paper-ink disabled:opacity-40"
                    >
                      sync now
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.platforms.map((p) => (
          <article
            key={p.platform}
            className={`border-2 p-5 space-y-3 ${
              p.available ? 'border-paper-ink bg-paper' : 'border-paper-edge bg-paper/50 opacity-70'
            }`}
          >
            <div className="text-xs uppercase tracking-wider text-paper-muted">{p.label}</div>
            <div className="text-2xl font-bold tabular-nums">{formatNumber(p.totalViews)}</div>
            <div className="text-2xs text-paper-muted">{p.videoCount} posts tracked</div>
            {p.available ? (
              <Link href={p.href} className="bracket text-xs inline-block hover:text-accent">
                open dashboard →
              </Link>
            ) : (
              <span className="text-2xs text-paper-dim italic">// connect or import first</span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
