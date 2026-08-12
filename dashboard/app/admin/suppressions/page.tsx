'use client';

import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';

type SuppressionRow = {
  id: string;
  category: string;
  categoryLabel: string;
  title: string;
  detail: string | null;
  reason: string | null;
  actor: string | null;
  timestamp: string | null;
  source: string | null;
  scope: string;
  restorable: boolean;
};

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'skipped_occurrence', label: 'Skipped' },
  { id: 'dismissed_calendar_item', label: 'Calendar dismissed' },
  { id: 'muted_source', label: 'Muted sources' },
  { id: 'business_suppression', label: 'Business suppressions' },
  { id: 'quarantined_intake', label: 'Quarantined intake' },
];

const SCOPE_LABEL: Record<string, string> = {
  occurrence: 'This occurrence only',
  source: 'Entire source',
  business: 'This business',
  category: 'Category-wide',
};

export default function SuppressionAdminPage() {
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return fetch(clientApiUrl('/api/creator-agent/hidden'))
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? 'Failed to load suppressions');
        setRows(json.rows ?? []);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(row: SuppressionRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(
        clientApiUrl(`/api/creator-agent/hidden/${row.category}/${row.id}/restore`),
        { method: 'POST' },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? 'Restore failed');
      } else {
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter === 'all' ? rows : rows.filter((r) => r.category === filter);
  const counts = CATEGORY_FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.id] = f.id === 'all' ? rows.length : rows.filter((r) => r.category === f.id).length;
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Hidden by Benson</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Every skip, dismissal, mute, and suppression that keeps a record out of your active
          queues — with why, who, when, and a way to bring it back.
        </p>
      </div>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`text-xs px-3 py-1.5 rounded-full border min-h-[36px] ${
              filter === f.id
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'border-neutral-700 text-neutral-300'
            }`}
          >
            {f.label} ({counts[f.id] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400 italic">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-400 italic">Nothing hidden in this category.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={`${row.category}:${row.id}`} className="rounded-xl border border-neutral-800 p-4 space-y-1.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="font-medium">{row.title}</div>
                <span className="text-2xs uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 shrink-0">
                  {row.categoryLabel}
                </span>
              </div>
              {row.detail ? <div className="text-sm text-neutral-400">{row.detail}</div> : null}
              {row.reason ? <div className="text-sm text-neutral-300">{row.reason}</div> : null}
              <div className="text-xs text-neutral-500 flex flex-wrap gap-x-3 gap-y-1">
                <span>{SCOPE_LABEL[row.scope] ?? row.scope}</span>
                {row.actor ? <span>by {row.actor}</span> : null}
                {row.timestamp ? <span>{new Date(row.timestamp).toLocaleString()}</span> : null}
                {row.source ? (
                  <a href={row.source} target="_blank" rel="noreferrer" className="text-accent">
                    Source
                  </a>
                ) : null}
              </div>
              {row.restorable ? (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void restore(row)}
                  className="text-xs text-accent mt-1 min-h-[36px] disabled:opacity-50"
                >
                  {busyId === row.id ? 'Restoring…' : 'Restore'}
                </button>
              ) : (
                <p className="text-2xs text-neutral-600 mt-1">Never surfaced — nothing to restore.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
