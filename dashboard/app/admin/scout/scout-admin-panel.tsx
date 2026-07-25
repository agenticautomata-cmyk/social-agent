'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';

type HealthSummary = {
  totalWatchers: number;
  activeWatchers: number;
  failedWatchers: number;
  loginRequired: number;
};

export function ScoutAdminPanel() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [pinned, setPinned] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    void fetch(clientApiUrl('/api/scout/admin/health'), { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: { ok: boolean; summary?: HealthSummary; pinned?: Record<string, string> }) => {
        setSummary(json.summary ?? null);
        setPinned(json.pinned ?? null);
      });
  }, []);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="page-title">Scout operations</h1>
        <p className="page-subtitle">Service health, pinned versions, and watchlist status.</p>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/scout/health" className="btn-ghost py-2 px-3">
          Health
        </Link>
        <Link href="/watchlist" className="btn-ghost py-2 px-3">
          Watchlist
        </Link>
      </nav>

      {summary && (
        <dl className="grid grid-cols-2 gap-3 text-sm card p-4">
          <div>
            <dt className="text-paper-muted">Total sources</dt>
            <dd className="text-lg font-semibold">{summary.totalWatchers}</dd>
          </div>
          <div>
            <dt className="text-paper-muted">Active</dt>
            <dd className="text-lg font-semibold">{summary.activeWatchers}</dd>
          </div>
          <div>
            <dt className="text-paper-muted">Failed</dt>
            <dd className="text-lg font-semibold">{summary.failedWatchers}</dd>
          </div>
          <div>
            <dt className="text-paper-muted">Login required</dt>
            <dd className="text-lg font-semibold">{summary.loginRequired}</dd>
          </div>
        </dl>
      )}

      {pinned && (
        <section className="card p-4 space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider">Pinned upstream</h2>
          <ul className="text-xs space-y-1 font-mono">
            {Object.entries(pinned).map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-paper-muted">
        Full ADR: <code>docs/scout-expansion-adr.md</code>
      </p>
    </div>
  );
}
