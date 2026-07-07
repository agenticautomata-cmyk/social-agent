'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '../../lib/datetime';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  freshnessStatus: string;
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

export function SourcesPanel() {
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [srcRes, runsRes] = await Promise.all([
        fetch(`${API}/api/sources`, { cache: 'no-store' }),
        fetch(`${API}/api/sources/runs?limit=20`, { cache: 'no-store' }),
      ]);
      if (!srcRes.ok) throw new Error(await srcRes.text());
      const srcRaw = await srcRes.text();
      // #region agent log
      fetch('http://127.0.0.1:7731/ingest/53206b45-9534-440d-b56e-a822c9223a78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ebb539'},body:JSON.stringify({sessionId:'ebb539',location:'sources-panel.tsx:load',message:'sources fetch response',data:{status:srcRes.status,contentType:srcRes.headers.get('content-type'),bodyPrefix:srcRaw.slice(0,80)},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      let srcData: { sources: SourceEntry[]; demoMode: boolean };
      try {
        srcData = JSON.parse(srcRaw) as { sources: SourceEntry[]; demoMode: boolean };
      } catch (parseErr) {
        // #region agent log
        fetch('http://127.0.0.1:7731/ingest/53206b45-9534-440d-b56e-a822c9223a78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ebb539'},body:JSON.stringify({sessionId:'ebb539',location:'sources-panel.tsx:load',message:'sources JSON.parse failed',data:{error:parseErr instanceof Error?parseErr.message:String(parseErr),bodyPrefix:srcRaw.slice(0,120)},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        throw parseErr;
      }
      setSources(srcData.sources);
      setDemoMode(srcData.demoMode);
      if (runsRes.ok) {
        const runsData = (await runsRes.json()) as { runs: IngestionRun[] };
        setRuns(runsData.runs);
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
            {sources.map((s) => (
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
                  {s.lastRunAt ? formatDateTime(s.lastRunAt) : '—'}
                </td>
                <td className="p-3 tabular-nums">{s.itemCountLastRun ?? '—'}</td>
                <td className="p-3">
                  <button
                    type="button"
                    disabled={!s.enabled || !!busy}
                    onClick={() => refreshOne(s.sourceId)}
                    className="min-h-[44px] text-2xs border border-paper-edge px-3 py-2 disabled:opacity-40"
                  >
                    {busy === s.sourceId ? '…' : 'refresh'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </div>
  );
}
