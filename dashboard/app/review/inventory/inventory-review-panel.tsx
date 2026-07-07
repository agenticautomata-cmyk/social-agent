'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { StatePill } from '../../../components/state-pill';
import {
  INVENTORY_FLAG_OPTIONS,
  INVENTORY_PRESETS,
  INVENTORY_SORT_OPTIONS,
  type InventoryDetailResponse,
  type InventoryItem,
  type InventoryListResponse,
  type InventoryPresetId,
  type InventorySortId,
  type EditorialPanelId,
  type EditorialPicksResponse,
} from '../../../lib/inventory-types';
import { EditorialPicksSection } from './editorial-picks-section';
import {
  InventoryBatchBar,
  patchPlannerBatch,
  PlannerPostAssist,
  PlannerQuickActions,
} from '../../../components/planner-quick-actions';
import { CreateSponsorLeadButton } from '../../../components/create-sponsor-lead-button';
import { IngestionFreshnessBanner } from '../../../components/ingestion-freshness-banner';
import { InventoryCategoryFilterBar } from '../../../components/inventory-category-filter-bar';
import { useInventoryCategoryFilter } from '../../../lib/inventory-category-filter';

import type { PlannerBatchAction } from '../../../lib/planner-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

import { formatDate, formatDateTime } from '../../../lib/datetime';

function locationLabel(item: InventoryItem): string {
  return item.venue ?? item.locationName ?? item.address ?? '—';
}

type Filters = {
  source: string;
  category: string;
  state: string;
  neighborhood: string;
  dateFrom: string;
  dateTo: string;
  flag: string;
  search: string;
  sort: InventorySortId;
  preset: InventoryPresetId;
};

const DEFAULT_FILTERS: Filters = {
  source: '',
  category: '',
  state: '',
  neighborhood: '',
  dateFrom: '',
  dateTo: '',
  flag: '',
  search: '',
  sort: 'event_date',
  preset: 'all',
};

function buildQuery(filters: Filters, excludedCategories: string[]): string {
  const params = new URLSearchParams();
  if (filters.source) params.set('source', filters.source);
  if (filters.category) params.set('category', filters.category);
  if (excludedCategories.length > 0) {
    params.set('excludeCategories', excludedCategories.join(','));
  }
  if (filters.state) params.set('state', filters.state);
  if (filters.neighborhood) params.set('neighborhood', filters.neighborhood);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.flag) params.set('flag', filters.flag);
  if (filters.search) params.set('search', filters.search);
  if (filters.sort !== 'event_date') params.set('sort', filters.sort);
  if (filters.preset !== 'all') params.set('preset', filters.preset);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-paper-edge px-3 py-2 min-w-[7rem]">
      <div className="text-2xs uppercase text-paper-muted tracking-wider">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-block text-2xs px-1.5 py-0.5 border border-paper-edge text-paper-muted mr-1 mb-1">
      {children}
    </span>
  );
}

export function InventoryReviewPanel() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get('id');
  const categoryFilter = useInventoryCategoryFilter({ syncUrl: true });
  const { excludedCategories, hydrated } = categoryFilter;
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<InventoryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [detail, setDetail] = useState<InventoryDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editorialPicks, setEditorialPicks] = useState<EditorialPicksResponse | null>(null);
  const [editorialLoading, setEditorialLoading] = useState(true);
  const [plannerTracking, setPlannerTracking] = useState<{
    saved?: boolean;
    covered?: boolean;
    note?: string | null;
    followUpAt?: string | null;
    draftCaption?: string | null;
    postedUrl?: string | null;
    postedAt?: string | null;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const loadPlannerState = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API}/api/content-planner/items/${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as {
        item: {
          draftCaption?: string | null;
          postedUrl?: string | null;
          postedAt?: string | null;
        } | null;
        tracking: {
          saved: boolean;
          covered: boolean;
          note: string | null;
          followUpAt: string | null;
        } | null;
      };
      setPlannerTracking(
        json.tracking
          ? {
              ...json.tracking,
              draftCaption: json.item?.draftCaption ?? null,
              postedUrl: json.item?.postedUrl ?? null,
              postedAt: json.item?.postedAt ?? null,
            }
          : null,
      );
    } catch {
      setPlannerTracking(null);
    }
  }, []);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedId(id);
  }, [searchParams]);

  const loadEditorialPicks = useCallback(async (excludedCategories: string[]) => {
    setEditorialLoading(true);
    try {
      const params = new URLSearchParams({ limit: '10' });
      if (excludedCategories.length > 0) {
        params.set('excludeCategories', excludedCategories.join(','));
      }
      const res = await fetch(`${API}/api/inventory/editorial-picks?${params}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = (await res.json()) as EditorialPicksResponse;
      setEditorialPicks(json);
    } catch {
      setEditorialPicks(null);
    } finally {
      setEditorialLoading(false);
    }
  }, []);

  const loadList = useCallback(
    async (active: Filters, activeExcluded: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API}/api/inventory${buildQuery(active, activeExcluded)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const json = (await res.json()) as InventoryListResponse;
        setData(json);
        setSelectedId((prev) => {
          if (!prev) return prev;
          return json.items.some((item) => item.id === prev) ? prev : null;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load inventory');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!hydrated) return;
    void loadEditorialPicks(excludedCategories);
  }, [excludedCategories, loadEditorialPicks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void loadList(filters, excludedCategories);
    }, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filters, excludedCategories, loadList, hydrated]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setPlannerTracking(null);
      return;
    }
    setDetailLoading(true);
    void loadPlannerState(selectedId);
    fetch(`${API}/api/inventory/${selectedId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<InventoryDetailResponse>;
      })
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId, loadPlannerState]);

  const selectedFromList = useMemo(
    () => data?.items.find((i) => i.id === selectedId) ?? null,
    [data, selectedId],
  );

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: InventoryPresetId) {
    setFilters((prev) => ({ ...prev, preset }));
  }

  const stats = data?.stats;

  const visibleByCategory = useMemo(
    () =>
      (stats?.byCategory ?? []).filter((row) => !excludedCategories.includes(row.category)),
    [stats?.byCategory, excludedCategories],
  );

  const hiddenEditorialPanels = useMemo((): EditorialPanelId[] => {
    const hidden: EditorialPanelId[] = [];
    if (excludedCategories.includes('estate_sale')) {
      hidden.push('topEstateSalesThisWeek');
    }
    return hidden;
  }, [excludedCategories]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    const ids = data?.items.map((i) => i.id) ?? [];
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }

  async function runBatchAction(action: PlannerBatchAction) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBatchBusy(true);
    setError(null);
    try {
      await patchPlannerBatch(ids, action);
      setSelectedIds(new Set());
      void loadList(filters, excludedCategories);
      void loadEditorialPicks(excludedCategories);
      if (selectedId) void loadPlannerState(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch action failed');
    } finally {
      setBatchBusy(false);
    }
  }

  const pageIds = data?.items.map((i) => i.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  return (
    <div className="space-y-8">
      {data?.demoMode && (
        <div className="border-2 border-accent bg-paper-tint px-4 py-3 text-sm">
          <strong>Demo mode:</strong> review UI only. Data may be local/dev.
        </div>
      )}

      <IngestionFreshnessBanner />

      <section>
        <div className="section-mark mb-3">
          <span>// § inventory review</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">inventory review</h1>
        <p className="text-paper-muted mt-2 italic">
          // browse all ingested opportunities — internal review, not final UI
        </p>
      </section>

      <InventoryCategoryFilterBar
        {...categoryFilter}
        loading={loading}
        categories={data?.stats?.byCategory}
      />

      {stats && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-paper-muted">Summary</h2>
          <div className="flex flex-wrap gap-2">
            <StatBlock label="Total" value={stats.total} />
            <StatBlock label="Showing" value={loading && data ? '…' : (data?.count ?? 0)} />
            <StatBlock label="Newest" value={formatDate(stats.newestAt)} />
            <StatBlock label="Oldest" value={formatDate(stats.oldestAt)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
            <div className="border border-paper-edge p-3">
              <div className="font-bold mb-2 text-paper-muted uppercase text-2xs">By source</div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {stats.bySource.map((s) => (
                  <li key={s.sourceName} className="flex justify-between gap-2">
                    <span className="truncate">{s.sourceName}</span>
                    <span className="tabular-nums text-paper-muted">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-paper-edge p-3">
              <div className="font-bold mb-2 text-paper-muted uppercase text-2xs">By category</div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {visibleByCategory.slice(0, 20).map((c) => (
                  <li key={c.category} className="flex justify-between gap-2">
                    <span className="truncate">{c.category.replace(/_/g, ' ')}</span>
                    <span className="tabular-nums text-paper-muted">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-paper-edge p-3">
              <div className="font-bold mb-2 text-paper-muted uppercase text-2xs">By pillar / flags</div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {stats.byPillar.map((p) => (
                  <li key={p.pillar} className="flex justify-between gap-2">
                    <span className="truncate">{p.pillar}</span>
                    <span className="tabular-nums text-paper-muted">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-paper-edge p-3">
              <div className="font-bold mb-2 text-paper-muted uppercase text-2xs">By state</div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {stats.byState.map((s) => (
                  <li key={s.state} className="flex justify-between gap-2">
                    <span className="truncate">{s.state}</span>
                    <span className="tabular-nums text-paper-muted">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <EditorialPicksSection
        data={editorialPicks}
        loading={editorialLoading}
        excludedCategories={excludedCategories}
        hiddenPanels={hiddenEditorialPanels}
        onSelectItem={setSelectedId}
        onBatchPlan={async (ids) => {
          setBatchBusy(true);
          try {
            await patchPlannerBatch(ids, 'plan_today');
            void loadList(filters, excludedCategories);
            void loadEditorialPicks(excludedCategories);
          } finally {
            setBatchBusy(false);
          }
        }}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-paper-muted">Presets</h2>
        <div className="flex flex-wrap gap-2">
          {INVENTORY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`text-xs px-3 py-1.5 border transition ${
                filters.preset === p.id
                  ? 'border-paper-ink bg-paper-ink text-paper font-bold'
                  : 'border-paper-edge text-paper-muted hover:border-paper-ink hover:text-paper-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 border-y border-paper-edge py-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-paper-muted">Filters &amp; search</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-paper-muted">Source</span>
            <select
              value={filters.source}
              onChange={(e) => updateFilter('source', e.target.value)}
              className="border border-paper-edge bg-paper px-2 py-1.5"
            >
              <option value="">All</option>
              {(data?.filterOptions.sources ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-paper-muted">Category</span>
            <select
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value)}
              className="border border-paper-edge bg-paper px-2 py-1.5"
            >
              <option value="">All</option>
              {(data?.filterOptions.categories ?? []).map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-paper-muted">State</span>
            <select
              value={filters.state}
              onChange={(e) => updateFilter('state', e.target.value)}
              className="border border-paper-edge bg-paper px-2 py-1.5"
            >
              <option value="">All</option>
              {(data?.filterOptions.states ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-paper-muted">Flag</span>
            <select
              value={filters.flag}
              onChange={(e) => updateFilter('flag', e.target.value)}
              className="border border-paper-edge bg-paper px-2 py-1.5"
            >
              <option value="">Any</option>
              {INVENTORY_FLAG_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-paper-muted">Date from</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
              className="border border-paper-edge bg-paper px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-paper-muted">Date to</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
              className="border border-paper-edge bg-paper px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-paper-muted">Neighborhood / location</span>
            <input
              type="text"
              value={filters.neighborhood}
              onChange={(e) => updateFilter('neighborhood', e.target.value)}
              placeholder="crossroads, plaza, …"
              className="border border-paper-edge bg-paper px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-paper-muted">Search</span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="title, venue, business, url…"
              className="border border-paper-edge bg-paper px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-paper-muted">Sort</span>
            <select
              value={filters.sort}
              onChange={(e) => updateFilter('sort', e.target.value as InventorySortId)}
              className="border border-paper-edge bg-paper px-2 py-1.5"
            >
              {INVENTORY_SORT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => setFilters(DEFAULT_FILTERS)}
          className="text-xs text-paper-muted hover:text-paper-ink underline"
        >
          reset filters
        </button>
      </section>

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
          // error: {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-12 text-center text-paper-muted italic">// loading inventory…</div>
      )}

      {loading && data && (
        <p className="text-2xs text-paper-muted italic">// refreshing listings…</p>
      )}

      <InventoryBatchBar
        selectedCount={selectedIds.size}
        busy={batchBusy}
        onAction={(action) => void runBatchAction(action)}
        onClear={() => setSelectedIds(new Set())}
      />

      <section
        className={`border-t-2 border-b-2 border-paper-ink overflow-x-auto transition-opacity ${
          loading && data ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-paper-muted">
              <th className="text-left py-2 pr-2 font-medium w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAllOnPage}
                  aria-label="Select all on page"
                />
              </th>
              <th className="text-left py-2 pr-4 font-medium w-24">state</th>
              <th className="text-left py-2 px-4 font-medium">title</th>
              <th className="text-left py-2 px-4 font-medium w-28">source</th>
              <th className="text-left py-2 px-4 font-medium w-28">category</th>
              <th className="text-left py-2 px-4 font-medium w-24">date</th>
              <th className="text-left py-2 px-4 font-medium w-32">venue</th>
              <th className="text-left py-2 px-4 font-medium w-28">neighborhood</th>
              <th className="text-left py-2 px-4 font-medium w-40">flags</th>
              <th className="text-left py-2 px-4 font-medium w-16">link</th>
            </tr>
          </thead>
          <tbody className="border-t border-paper-ink">
            {(data?.items ?? []).map((item) => (
              <tr
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`border-t border-paper-edge align-top cursor-pointer transition-colors ${
                  selectedId === item.id ? 'bg-paper-tint' : 'hover:bg-paper-tint'
                }`}
              >
                <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    aria-label={`Select ${item.title}`}
                  />
                </td>
                <td className="py-2 pr-4">
                  <StatePill state={item.state} />
                </td>
                <td className="py-2 px-4 max-w-xs">
                  <div className="font-bold truncate lowercase">{item.title.toLowerCase()}</div>
                  {item.businessName && (
                    <div className="text-2xs text-paper-muted truncate">{item.businessName}</div>
                  )}
                </td>
                <td className="py-2 px-4 text-xs text-paper-soft truncate">
                  {item.sourceName?.toLowerCase() ?? item.ingest ?? '—'}
                </td>
                <td className="py-2 px-4 text-xs text-paper-soft">
                  {item.category?.replace(/_/g, ' ') ?? '—'}
                </td>
                <td className="py-2 px-4 text-2xs text-paper-muted tabular-nums whitespace-nowrap">
                  {formatDate(item.eventDate ?? item.discoveredAt ?? item.createdAt)}
                </td>
                <td className="py-2 px-4 text-xs text-paper-soft max-w-[8rem] truncate">
                  {locationLabel(item)}
                </td>
                <td className="py-2 px-4 text-xs text-paper-soft truncate">
                  {item.neighborhood ?? '—'}
                </td>
                <td className="py-2 px-4">
                  {item.badges.slice(0, 4).map((b) => (
                    <Badge key={b}>{b}</Badge>
                  ))}
                  {item.badges.length > 4 && (
                    <span className="text-2xs text-paper-muted">+{item.badges.length - 4}</span>
                  )}
                </td>
                <td className="py-2 px-4 text-xs">
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="bracket text-paper-muted hover:text-paper-ink"
                    >
                      src
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {!loading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={10} className="py-16 text-center text-paper-muted italic">
                  // no items match current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && data && (
          <div className="py-2 text-center text-2xs text-paper-muted italic">// refreshing…</div>
        )}
      </section>

      {selectedId && (selectedFromList || detail) && (
        <aside className="fixed inset-y-0 right-0 w-full max-w-lg bg-paper border-l-2 border-paper-ink shadow-lg z-50 overflow-y-auto">
          <div className="sticky top-0 bg-paper border-b border-paper-edge px-6 py-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold lowercase leading-tight">
              {(detail?.item ?? selectedFromList)?.title.toLowerCase()}
            </h2>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-paper-muted hover:text-paper-ink text-sm shrink-0"
            >
              [close]
            </button>
          </div>

          <div className="px-6 py-6 space-y-6 text-sm">
            {detailLoading && (
              <p className="text-paper-muted italic text-xs">// loading detail…</p>
            )}

            {(() => {
              const item = detail?.item ?? selectedFromList;
              if (!item) return null;

              return (
                <>
                  <section>
                    <h3 className="text-2xs uppercase text-paper-muted mb-2">Summary</h3>
                    <p className="text-paper-soft whitespace-pre-wrap">
                      {item.summary ?? '// no summary'}
                    </p>
                  </section>

                  <section>
                    <h3 className="text-2xs uppercase text-paper-muted mb-2">Why it might matter to Kellie</h3>
                    <p className="text-paper-soft">{item.whyItMatters}</p>
                  </section>

                  <section className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-paper-muted">Source</span>
                      <div>{item.sourceName ?? item.ingest ?? '—'}</div>
                    </div>
                    <div>
                      <span className="text-paper-muted">Category</span>
                      <div>{item.category?.replace(/_/g, ' ') ?? '—'}</div>
                    </div>
                    <div>
                      <span className="text-paper-muted">State</span>
                      <div><StatePill state={item.state} /></div>
                    </div>
                    <div>
                      <span className="text-paper-muted">Audience score</span>
                      <div className="tabular-nums">{item.audienceScore}</div>
                    </div>
                    <div>
                      <span className="text-paper-muted">Event date</span>
                      <div>{formatDateTime(item.eventDate)}</div>
                    </div>
                    <div>
                      <span className="text-paper-muted">Event end</span>
                      <div>{formatDateTime(item.eventEndDate)}</div>
                    </div>
                    <div>
                      <span className="text-paper-muted">Discovered</span>
                      <div>{formatDateTime(item.discoveredAt)}</div>
                    </div>
                    <div>
                      <span className="text-paper-muted">Created</span>
                      <div>{formatDateTime(item.createdAt)}</div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-2xs uppercase text-paper-muted mb-2">Venue / address</h3>
                    <p className="text-xs text-paper-soft">
                      {[item.venue, item.address, item.neighborhood, item.locationName]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                    {item.businessName && (
                      <p className="text-xs mt-1">
                        Business: <span className="font-bold">{item.businessName}</span>
                      </p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-2xs uppercase text-paper-muted mb-2">Flags</h3>
                    <div>
                      {item.badges.length ? item.badges.map((b) => <Badge key={b}>{b}</Badge>) : '—'}
                    </div>
                  </section>

                  {item.sourceUrl && (
                    <section>
                      <h3 className="text-2xs uppercase text-paper-muted mb-2">Source URL</h3>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link text-xs break-all"
                      >
                        {item.sourceUrl}
                      </a>
                    </section>
                  )}

                  <section>
                    <h3 className="text-2xs uppercase text-paper-muted mb-2">Raw metadata</h3>
                    <pre className="text-2xs bg-paper-tint border border-paper-edge p-3 overflow-x-auto max-h-64">
                      {JSON.stringify(detail?.raw?.metadata ?? item.metadata, null, 2)}
                    </pre>
                  </section>

                  <section>
                    <h3 className="text-2xs uppercase text-paper-muted mb-2">Content planning</h3>
                    <PlannerQuickActions
                      target={{
                        id: item.id,
                        title: item.title,
                        tracking: plannerTracking ?? undefined,
                      }}
                      onAction={() => void loadPlannerState(item.id)}
                    />
                    <div className="mt-4">
                      <PlannerPostAssist
                        contentItemId={item.id}
                        draftCaption={plannerTracking?.draftCaption}
                        postedUrl={plannerTracking?.postedUrl}
                        onUpdate={() => void loadPlannerState(item.id)}
                      />
                    </div>
                  </section>

                  <section>
                    <h3 className="text-2xs uppercase text-paper-muted mb-2">Sponsor outreach</h3>
                    <CreateSponsorLeadButton contentItemId={item.id} title={item.title} />
                  </section>

                  <section>
                    <h3 className="text-2xs uppercase text-paper-muted mb-2">Notes</h3>
                    {plannerTracking?.note ? (
                      <p className="text-xs text-paper-soft whitespace-pre-wrap">{plannerTracking.note}</p>
                    ) : (
                      <p className="text-xs text-paper-muted italic">// no notes yet — use add note above</p>
                    )}
                  </section>

                  {detail && (detail.industryName || detail.personaName) && (
                    <section className="text-xs text-paper-muted border-t border-paper-edge pt-4">
                      {detail.industryName && <div>Industry: {detail.industryName}</div>}
                      {detail.personaName && <div>Persona: {detail.personaName}</div>}
                    </section>
                  )}
                </>
              );
            })()}
          </div>
        </aside>
      )}

      {selectedId && (
        <div
          className="fixed inset-0 bg-paper-ink/20 z-40"
          onClick={() => setSelectedId(null)}
          aria-hidden
        />
      )}
    </div>
  );
}
