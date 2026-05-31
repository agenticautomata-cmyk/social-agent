'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AnalyticsHubSummary } from '../../lib/creator-analytics-types';
import { formatNumber } from '../../lib/creator-analytics-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function AnalyticsHubPanel() {
  const [data, setData] = useState<AnalyticsHubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/analytics`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<AnalyticsHubSummary>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          demo mode — sample TikTok data loaded automatically. import your own CSV anytime.
        </p>
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
            <div className="text-2xs text-paper-muted">{p.videoCount} videos tracked</div>
            {p.available ? (
              <Link href={p.href} className="bracket text-xs inline-block hover:text-accent">
                open dashboard →
              </Link>
            ) : (
              <span className="text-2xs text-paper-dim italic">// coming soon — import first</span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
