'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';

type OpeningCard = {
  id: string;
  businessName: string;
  category: string | null;
  neighborhood: string | null;
  city: string | null;
  address: string | null;
  status: string;
  expectedOpening: string | null;
  exactOpeningDate: string | null;
  grandOpeningDate: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  verificationLevel: string;
  lastChecked: string;
  creatorFitScore: number | null;
  recommendedNextAction: string | null;
  opportunityDecision: string | null;
  eventDecision: string | null;
  opportunityContentItemId: string | null;
  calendarItemId: string | null;
  isLocalIndependent: boolean | null;
  relocationStatus: string | null;
  expansionStatus: string | null;
  latitude: number | null;
  longitude: number | null;
};

type ViewMode = 'list' | 'cards' | 'map' | 'timeline';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'opening_soon', label: 'Opening soon' },
  { id: 'soft_opened', label: 'Soft opened' },
  { id: 'grand_opening_scheduled', label: 'Grand opening' },
  { id: 'opened_recently', label: 'Opened' },
  { id: 'restaurants', label: 'Restaurants' },
  { id: 'bars', label: 'Bars' },
  { id: 'retail', label: 'Retail' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'locally_owned', label: 'Locally owned' },
  { id: 'chains', label: 'Chains' },
  { id: 'relocations', label: 'Relocations' },
  { id: 'expansions', label: 'Expansions' },
  { id: 'needs_verification', label: 'Needs verification' },
  { id: 'creator_opportunity', label: 'Creator opportunity' },
];

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ');
}

export function OpeningsRadarPanel() {
  const [items, setItems] = useState<OpeningCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<'urgency' | 'discovered' | 'expected'>('urgency');
  const [view, setView] = useState<ViewMode>('cards');
  const [selected, setSelected] = useState<OpeningCard | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (filter) params.set('filter', filter);
    params.set('sort', sort);
    return fetch(clientApiUrl(`/api/openings-radar?${params}`), { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: { ok: boolean; items?: OpeningCard[]; total?: number; error?: string }) => {
        if (!json.ok) throw new Error(json.error ?? 'Failed to load openings');
        setItems(json.items ?? []);
        setTotal(json.total ?? 0);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, filter, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo(() => {
    return [...items].sort((a, b) => {
      const da = a.exactOpeningDate ?? a.grandOpeningDate ?? a.expectedOpening ?? '';
      const db = b.exactOpeningDate ?? b.grandOpeningDate ?? b.expectedOpening ?? '';
      return da.localeCompare(db);
    });
  }, [items]);

  async function act(id: string, action: 'opened' | 'delayed' | 'dismiss') {
    setBusy(id);
    try {
      if (action === 'dismiss') {
        await fetch(clientApiUrl(`/api/openings-radar/${id}/dismiss`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'dismissed_from_ui' }),
        });
      } else {
        await fetch(clientApiUrl(`/api/openings-radar/${id}/status`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: action === 'opened' ? 'open' : 'delayed' }),
        });
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading && items.length === 0) {
    return <p className="text-sm text-paper-muted italic">Loading openings…</p>;
  }
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input text-sm min-h-[40px] min-w-[200px] flex-1"
          placeholder="Search business, address, neighborhood…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input text-sm min-h-[40px]"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="urgency">Sort: urgency</option>
          <option value="discovered">Sort: discovered</option>
          <option value="expected">Sort: expected opening</option>
        </select>
        <div className="flex gap-1">
          {(['cards', 'list', 'timeline', 'map'] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`btn-ghost text-xs py-2 px-3 min-h-[40px] ${view === v ? 'ring-1 ring-accent' : ''}`}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            type="button"
            className={`btn-ghost text-xs py-1.5 px-2.5 ${filter === f.id ? 'ring-1 ring-accent' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-paper-muted">{total} opening{total === 1 ? '' : 's'}</p>

      {view === 'map' && (
        <div className="rounded border border-white/10 p-4 text-sm text-paper-muted">
          {items.some((i) => i.latitude != null) ? (
            <ul className="space-y-2">
              {items
                .filter((i) => i.latitude != null)
                .map((i) => (
                  <li key={i.id}>
                    <strong>{i.businessName}</strong> — {i.latitude}, {i.longitude} · {i.address}
                  </li>
                ))}
            </ul>
          ) : (
            <p>No coordinates yet. Cards still list addresses for visit planning.</p>
          )}
        </div>
      )}

      {view === 'timeline' && (
        <ol className="space-y-3 border-l border-white/10 pl-4">
          {timeline.map((item) => (
            <li key={item.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-accent" />
              <p className="text-xs text-paper-muted">
                {item.exactOpeningDate ?? item.grandOpeningDate ?? item.expectedOpening ?? 'date TBD'}
              </p>
              <p className="font-medium">{item.businessName}</p>
              <p className="text-sm text-paper-muted">{item.address}</p>
            </li>
          ))}
        </ol>
      )}

      {(view === 'cards' || view === 'list') && (
        <div className={view === 'cards' ? 'grid gap-3 sm:grid-cols-2' : 'space-y-2'}>
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded border border-white/10 p-4 space-y-2 bg-black/10"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-base">{item.businessName}</h2>
                  <p className="text-xs text-paper-muted">
                    {[item.category, item.neighborhood ?? item.city].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-xs uppercase tracking-wide text-accent shrink-0">
                  {statusLabel(item.status)}
                </span>
              </div>
              {item.address && <p className="text-sm">{item.address}</p>}
              <p className="text-sm">
                Expected:{' '}
                <strong>{item.exactOpeningDate ?? item.expectedOpening ?? 'unspecified'}</strong>
                {item.grandOpeningDate ? ` · Grand opening ${item.grandOpeningDate}` : ''}
              </p>
              <p className="text-xs text-paper-muted">
                Source: {item.sourceTitle ?? 'editorial'} · {item.verificationLevel} · checked{' '}
                {new Date(item.lastChecked).toLocaleDateString()}
                {item.creatorFitScore != null ? ` · fit ${item.creatorFitScore.toFixed(2)}` : ''}
              </p>
              {item.recommendedNextAction && (
                <p className="text-xs text-paper-muted">{item.recommendedNextAction}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {item.opportunityContentItemId && (
                  <Link
                    href={`/opportunities/${item.opportunityContentItemId}`}
                    className="btn-ghost text-xs py-1.5 px-2"
                  >
                    Opportunity
                  </Link>
                )}
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost text-xs py-1.5 px-2"
                  >
                    Open source
                  </a>
                )}
                <button
                  type="button"
                  className="btn-ghost text-xs py-1.5 px-2"
                  onClick={() => setSelected(item)}
                >
                  View evidence
                </button>
                <Link href={`/watchlist/add`} className="btn-ghost text-xs py-1.5 px-2">
                  Add Watchlist
                </Link>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1.5 px-2"
                  disabled={busy === item.id}
                  onClick={() => void act(item.id, 'opened')}
                >
                  Mark opened
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1.5 px-2"
                  disabled={busy === item.id}
                  onClick={() => void act(item.id, 'delayed')}
                >
                  Mark delayed
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1.5 px-2"
                  disabled={busy === item.id}
                  onClick={() => void act(item.id, 'dismiss')}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <p className="text-sm text-paper-muted italic">No openings match these filters.</p>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded bg-ink border border-white/10 p-4 space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between gap-2">
              <h3 className="font-semibold">{selected.businessName}</h3>
              <button type="button" className="btn-ghost" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <p className="text-sm">{selected.address}</p>
            <p className="text-sm text-paper-muted">
              Opportunity: {selected.opportunityDecision ?? 'n/a'}
            </p>
            <p className="text-sm text-paper-muted">Event: {selected.eventDecision ?? 'n/a'}</p>
            <EvidenceLoader id={selected.id} />
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceLoader({ id }: { id: string }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    void fetch(clientApiUrl(`/api/openings-radar/${id}`), { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: { evidence?: Array<{ excerpt: string; field?: string | null }> }) => {
        setLines((json.evidence ?? []).map((e) => `${e.field ?? 'note'}: ${e.excerpt}`));
      });
  }, [id]);
  if (!lines.length) return <p className="text-xs text-paper-muted italic">Loading evidence…</p>;
  return (
    <ul className="space-y-2 text-sm">
      {lines.map((l, i) => (
        <li key={i} className="border-l border-white/10 pl-2 text-paper-muted">
          {l}
        </li>
      ))}
    </ul>
  );
}
