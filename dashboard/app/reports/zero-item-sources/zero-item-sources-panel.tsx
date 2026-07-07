'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '../../../lib/datetime';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ZeroRow = {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  itemCount: number;
  lastError: string | null;
  reason: string;
};

type ZeroReport = {
  ok: boolean;
  count: number;
  sources: ZeroRow[];
};

export function ZeroItemSourcesPanel() {
  const [data, setData] = useState<ZeroReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/reports/zero-item-sources`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<ZeroReport>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <Link href="/sources" className="bracket text-sm hover:text-accent">
        ← sources health
      </Link>

      {data && (
        <p className="text-2xs text-paper-muted">
          {data.count} source{data.count === 1 ? '' : 's'} with zero stored items
        </p>
      )}

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// error: {error}</div>
      )}

      {loading && !data && (
        <div className="py-12 text-center text-paper-muted italic">// loading report…</div>
      )}

      {data && data.sources.length === 0 && (
        <p className="text-sm text-paper-muted italic py-8 border border-dashed border-paper-edge text-center">
          // all configured sources have at least one ingested item
        </p>
      )}

      {data && data.sources.length > 0 && (
        <div className="overflow-x-auto border-2 border-paper-edge">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-paper-muted border-b border-paper-edge">
                <th className="px-4 py-2 font-normal">source</th>
                <th className="px-4 py-2 font-normal">type</th>
                <th className="px-4 py-2 font-normal">status</th>
                <th className="px-4 py-2 font-normal">last run</th>
                <th className="px-4 py-2 font-normal">reason</th>
                <th className="px-4 py-2 font-normal">error</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((row) => (
                <tr key={row.sourceId} className="border-b border-paper-edge/60">
                  <td className="px-4 py-2 font-bold lowercase">{row.sourceName.toLowerCase()}</td>
                  <td className="px-4 py-2 lowercase">{row.sourceType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2">
                    {row.enabled ? row.lastRunStatus ?? '—' : 'disabled'}
                  </td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                    {row.lastRunAt ? formatDateTime(row.lastRunAt) : '—'}
                  </td>
                  <td className="px-4 py-2 text-paper-soft">{row.reason}</td>
                  <td className="px-4 py-2 text-accent">{row.lastError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
