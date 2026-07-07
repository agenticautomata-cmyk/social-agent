'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '../lib/datetime';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type FreshnessSummary = {
  dataFreshnessAt: string | null;
  sourcesRefreshedToday: number;
  lastRefreshStatus: string;
  lastRefreshAt: string | null;
  lastRefreshError: string | null;
  ingestedItemCount: number;
  staleItemCount: number;
  demoMode: boolean;
};

export function IngestionFreshnessBanner() {
  const [freshness, setFreshness] = useState<FreshnessSummary | null>(null);

  useEffect(() => {
    fetch(`${API}/api/sources/freshness`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { freshness: FreshnessSummary };
        return data.freshness;
      })
      .then(setFreshness)
      .catch(() => setFreshness(null));
  }, []);

  if (!freshness) return null;

  const checked = freshness.dataFreshnessAt
    ? formatDateTime(freshness.dataFreshnessAt)
    : 'never';

  return (
    <div className="border border-paper-edge bg-paper-tint px-4 py-3 text-2xs flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-bold uppercase tracking-wider text-paper-ink">inventory data</span>
      <span className="text-paper-muted">
        last checked: <span className="text-paper-ink">{checked}</span>
      </span>
      <span className="text-paper-muted">
        sources refreshed today:{' '}
        <span className="text-paper-ink tabular-nums">{freshness.sourcesRefreshedToday}</span>
      </span>
      <span className="text-paper-muted">
        last refresh:{' '}
        <span className="text-paper-ink">{freshness.lastRefreshStatus}</span>
      </span>
      {freshness.lastRefreshError && (
        <span className="text-accent">{freshness.lastRefreshError}</span>
      )}
      <Link href="/sources" className="underline text-paper-ink min-h-[44px] inline-flex items-center">
        source refresh →
      </Link>
    </div>
  );
}
