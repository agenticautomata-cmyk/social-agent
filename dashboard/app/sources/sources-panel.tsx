'use client';

import { clientApiOrigin } from '../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '../../lib/datetime';
import { DiscoverySubscriptionsPanel } from '../../components/discovery-subscriptions-panel';
import { SourceItemsDrawer, viewItemsLabel } from '../../components/source-items-drawer';

const API = clientApiOrigin();

type SourceEntry = {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  feedUrl: string | null;
  category: string;
  pillar: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  itemCountLastRun: number | null;
  durableItemCount?: number;
  freshnessStatus: string;
  mutePolicy: 'none' | 'always_ignore';
};

type IngestionRun = {
  id: string;
  sourceName: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errorMessage: string | null;
  dryRun: boolean;
};

type BensonDiscoveryRow = {
  sourceId: string;
  sourceName: string;
  normalizedName: string;
  feedUrl: string | null;
  contentItemId: string | null;
  title: string | null;
  creatorRelevanceStatus: string | null;
  lifecycleStatus: string | null;
  enrichmentStatus: string | null;
  lastRunAt: string | null;
};

/** View / ITEMS authority — durable source-linked inventory only. Never last-run. */
function durableItemCount(s: SourceEntry): number {
  return Math.max(0, s.durableItemCount ?? 0);
}

export function SourcesPanel() {
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [discoveries, setDiscoveries] = useState<BensonDiscoveryRow[]>([]);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inspectSource, setInspectSource] = useState<SourceEntry | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [srcRes, runsRes, discRes] = await Promise.all([
        fetch(`${API}/api/sources`, { cache: 'no-store' }),
        fetch(`${API}/api/sources/runs?limit=20`, { cache: 'no-store' }),
        fetch(`${API}/api/creator-interest/discoveries`, { cache: 'no-store' }),
      ]);
      if (!srcRes.ok) throw new Error(await srcRes.text());
      const srcData = (await srcRes.json()) as { sources: SourceEntry[]; demoMode: boolean };
      setSources(srcData.sources);
      setDemoMode(srcData.demoMode);
      if (runsRes.ok) {
        const runsData = (await runsRes.json()) as { runs: IngestionRun[] };
        setRuns(runsData.runs);
      }
      if (discRes.ok) {
        const discData = (await discRes.json()) as { discoveries: BensonDiscoveryRow[] };
        setDiscoveries(discData.discoveries ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshOne(sourceId: string) {
    setBusy(sourceId);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/sources/${sourceId}/refresh`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setMessage(
        `${data.result?.sourceName ?? sourceId}: +${data.result?.created ?? 0} new, ${data.result?.updated ?? 0} updated`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setBusy(null);
    }
  }

  async function toggleMute(sourceId: string, currentlyMuted: boolean) {
    setBusy(sourceId + '-mute');
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/sources/${sourceId}/${currentlyMuted ? 'unmute' : 'mute'}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setMessage(currentlyMuted ? 'Source unmuted.' : 'Source muted — routine items will stay hidden.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mute action failed');
    } finally {
      setBusy(null);
    }
  }

  async function refreshAll(dryRun: boolean) {
    setBusy(dryRun ? 'dry-run' : 'live');
    setMessage(null);
    try {
      const res = await fetch(
        `${API}/api/sources/refresh-all?dry_run=${dryRun ? 'true' : 'false'}`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setMessage(
        `Refresh ${dryRun ? '(dry run)' : '(live)'}: ${data.totals?.created ?? 0} created, ${data.totals?.updated ?? 0} updated, ${data.totals?.failed ?? 0} failed`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh all failed');
    } finally {
      setBusy(null);
    }
  }

  function openItems(s: SourceEntry) {
    if (durableItemCount(s) <= 0) return;
    setInspectSource(s);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold lowercase">source refresh</h1>
        <p className="text-sm text-paper-muted max-w-2xl">
          Operator tooling — refresh existing KC sources on demand. Live email stays off. Demo mode:{' '}
          <strong>{demoMode ? 'on' : 'off'}</strong> (seed/demo rows may still appear alongside live
          ingest).
        </p>
      </header>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/reports/zero-item-sources" className="bracket hover:text-accent">
          zero item sources report →
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => refreshAll(true)}
          className="min-h-[44px] border border-paper-edge px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy === 'dry-run' ? 'running dry run…' : 'refresh all (dry run)'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => refreshAll(false)}
          className="min-h-[44px] border-2 border-paper-ink px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {busy === 'live' ? 'refreshing…' : 'refresh all (live)'}
        </button>
      </div>

      {message && <p className="text-sm text-paper-ink">{message}</p>}
      {error && <p className="text-sm text-accent">{error}</p>}

      <section className="border border-paper-edge overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-paper-muted border-b border-paper-edge">
              <th className="text-left p-3">source</th>
              <th className="text-left p-3">category</th>
              <th className="text-left p-3">status</th>
              <th className="text-left p-3">last run</th>
              <th className="text-left p-3">items</th>
              <th className="text-left p-3" />
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const viewCount = durableItemCount(s);
              const viewLabel = viewItemsLabel(viewCount);
              return (
                <tr key={s.sourceId} className="border-b border-paper-edge/60">
                  <td className="p-3">
                    <div className="font-medium">{s.sourceName}</div>
                    <div className="text-2xs text-paper-muted">{s.sourceType}</div>
                    {s.feedUrl && (
                      <div className="text-2xs text-paper-dim truncate max-w-xs">{s.feedUrl}</div>
                    )}
                  </td>
                  <td className="p-3 text-2xs">
                    {s.category} / {s.pillar}
                  </td>
                  <td className="p-3">
                    <span
                      className={
                        s.freshnessStatus === 'error'
                          ? 'text-accent'
                          : s.freshnessStatus === 'fresh'
                            ? 'text-paper-ink'
                            : 'text-paper-muted'
                      }
                    >
                      {s.freshnessStatus}
                    </span>
                    {s.lastError && (
                      <div className="text-2xs text-accent mt-1 max-w-xs">{s.lastError}</div>
                    )}
                  </td>
                  <td className="p-3 text-2xs text-paper-muted">
                    <div>{s.lastRunAt ? formatDateTime(s.lastRunAt) : '—'}</div>
                    {s.itemCountLastRun != null ? (
                      <div className="text-2xs text-paper-dim mt-0.5" title="Last-run extract count (diagnostic only; not actionable)">
                        last extract {s.itemCountLastRun}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    {viewCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => openItems(s)}
                        className="tabular-nums min-h-[44px] min-w-[44px] text-left underline decoration-paper-edge hover:decoration-accent hover:text-accent"
                        title={viewLabel}
                      >
                        {viewCount}
                      </button>
                    ) : (
                      <span className="tabular-nums">0</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {viewCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => openItems(s)}
                          className="min-h-[44px] text-2xs border-2 border-paper-ink px-3 py-2 font-bold hover:bg-paper-ink hover:text-paper"
                        >
                          {viewLabel}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={!s.enabled || !!busy}
                        onClick={() => refreshOne(s.sourceId)}
                        className="min-h-[44px] text-2xs border border-paper-edge px-3 py-2 disabled:opacity-40"
                      >
                        {busy === s.sourceId ? '…' : 'refresh'}
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => toggleMute(s.sourceId, s.mutePolicy === 'always_ignore')}
                        title="Mute suppresses routine items from this source everywhere; genuinely notable exceptions still surface."
                        className={`min-h-[44px] text-2xs border px-3 py-2 disabled:opacity-40 ${
                          s.mutePolicy === 'always_ignore'
                            ? 'border-accent text-accent'
                            : 'border-paper-edge text-paper-muted hover:text-paper-ink'
                        }`}
                      >
                        {busy === s.sourceId + '-mute'
                          ? '…'
                          : s.mutePolicy === 'always_ignore'
                            ? 'muted — unmute'
                            : 'mute source'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">benson discoveries (creator actions)</h2>
        <p className="text-xs text-paper-muted max-w-2xl">
          Scrape discoveries link to normalized creator records — not raw operator output. Tap through
          for research, Ask Benson, and visit planning.
        </p>
        <div className="border border-paper-edge overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-paper-muted border-b border-paper-edge">
                <th className="text-left p-3">entity</th>
                <th className="text-left p-3">status</th>
                <th className="text-left p-3">enrichment</th>
                <th className="text-left p-3" />
              </tr>
            </thead>
            <tbody>
              {discoveries.slice(0, 40).map((row) => (
                <tr key={row.sourceId} className="border-b border-paper-edge/60">
                  <td className="p-3">
                    <div className="font-medium">{row.normalizedName}</div>
                    <div className="text-2xs text-paper-muted">{row.title ?? 'No linked record yet'}</div>
                  </td>
                  <td className="p-3 text-2xs">
                    {[row.creatorRelevanceStatus, row.lifecycleStatus].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="p-3 text-2xs">{row.enrichmentStatus ?? '—'}</td>
                  <td className="p-3">
                    {row.contentItemId ? (
                      <Link
                        href={`/discoveries/${row.contentItemId}`}
                        className="text-2xs border border-paper-edge px-3 py-2 min-h-[44px] inline-flex items-center hover:text-accent"
                      >
                        open creator record →
                      </Link>
                    ) : (
                      <span className="text-2xs text-paper-muted">pending ingest</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">recent runs</h2>
        <ul className="space-y-2 text-2xs">
          {runs.map((r) => (
            <li key={r.id} className="border border-paper-edge p-3">
              <span className="font-bold">{r.sourceName}</span>
              {' · '}
              {r.status}
              {r.dryRun ? ' (dry)' : ''}
              {' · '}+{r.createdCount} / ~{r.updatedCount} / skip {r.skippedCount}
              {r.errorMessage && <span className="text-accent"> — {r.errorMessage}</span>}
              <div className="text-paper-muted mt-1">
                {formatDateTime(r.startedAt)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <DiscoverySubscriptionsPanel />

      {inspectSource ? (
        <SourceItemsDrawer
          sourceId={inspectSource.sourceId}
          sourceName={inspectSource.sourceName}
          onClose={() => setInspectSource(null)}
          onItemsChanged={(count) => {
            setSources((prev) =>
              prev.map((row) =>
                row.sourceId === inspectSource.sourceId
                  ? { ...row, durableItemCount: count }
                  : row,
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}
