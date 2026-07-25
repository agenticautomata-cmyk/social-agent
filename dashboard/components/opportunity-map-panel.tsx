'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { patchPlannerBatch } from './planner-quick-actions';
import { COVERAGE_FORMAT_LABELS, COVERAGE_FORMATS } from '../lib/coverage-format-types';
import {
  buildMapApiQuery,
  DEFAULT_MAP_FILTERS,
  parseMapFiltersFromSearchParams,
  syncMapFiltersToUrl,
  type MapFilters,
} from '../lib/opportunity-map-query';
import {
  mapFilterFitKey,
  mobileViewAfterMarkerSelect,
  mobileViewAfterToggle,
  shouldPanToSelection,
} from '../lib/opportunity-map-interaction';
import {
  MAP_DATE_PRESET_LABELS,
  MAP_SORT_LABELS,
  type MapDatePreset,
  type MapOpportunitiesResponse,
  type MapOpportunityPin,
  type MapSortId,
} from '../lib/opportunity-map-types';
import { formatDateTime } from '../lib/datetime';

const OpportunityMapView = dynamic(
  () => import('./opportunity-map-view').then((mod) => mod.OpportunityMapView),
  {
    ssr: false,
    loading: () => (
      <div className="border-2 border-paper-edge min-h-[320px] md:min-h-[480px] flex items-center justify-center text-sm text-paper-muted italic">
        // loading map…
      </div>
    ),
  },
);

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const DATE_PRESET_OPTIONS: MapDatePreset[] = [
  'today',
  'tomorrow',
  'this_week',
  'this_weekend',
  'next_7_days',
  'next_30_days',
  'custom',
];

const SORT_OPTIONS: MapSortId[] = ['soonest', 'highest_score', 'nearest', 'recently_discovered'];

type MobileView = 'map' | 'list';

function locationStatusLabel(pin: MapOpportunityPin): string {
  if (pin.needsReviewPin) return 'Needs review';
  if (pin.locationStatus === 'verified') return 'Verified';
  return 'Resolved';
}

function PreviewCard({
  pin,
  onClose,
  onPlanned,
}: {
  pin: MapOpportunityPin;
  onClose: () => void;
  onPlanned: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function markForFilmingDay() {
    setBusy(true);
    try {
      await patchPlannerBatch([pin.id], 'plan_today');
      onPlanned();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="border-2 border-paper-ink bg-paper p-4 space-y-3 shadow-lg"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold lowercase">{pin.title.toLowerCase()}</h3>
          <p className="text-xs text-paper-muted mt-1">{formatDateTime(pin.eventDate)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-paper-muted hover:text-paper-ink"
          aria-label="Close preview"
        >
          close
        </button>
      </div>
      {pin.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.thumbnailUrl} alt="" className="w-full max-h-36 object-cover border border-paper-edge" />
      ) : null}
      <div className="text-sm space-y-1">
        <p>{pin.locationName ?? 'Location pending'}</p>
        <p className="text-paper-muted text-xs">{pin.formattedAddress ?? '—'}</p>
        <p className="text-xs">
          {pin.coverageFormat ? COVERAGE_FORMAT_LABELS[pin.coverageFormat] : 'Unassigned coverage'} · score{' '}
          {pin.score.toFixed(1)} · {locationStatusLabel(pin)}
          {pin.locationConfidence != null ? ` (${Math.round(pin.locationConfidence * 100)}%)` : ''}
        </p>
        {pin.sourceName ? <p className="text-xs text-paper-muted">Source: {pin.sourceName}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={pin.detailUrl} className="border border-paper-ink px-3 py-1.5 text-xs hover:bg-paper-muted/10">
          Open opportunity
        </Link>
        {pin.googleMapsUrl ? (
          <a
            href={pin.googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="border border-paper-ink px-3 py-1.5 text-xs hover:bg-paper-muted/10"
          >
            Open in Google Maps
          </a>
        ) : null}
        <button
          type="button"
          disabled={busy || pin.selectedForFilming}
          onClick={() => void markForFilmingDay()}
          className="border border-paper-ink px-3 py-1.5 text-xs hover:bg-paper-muted/10 disabled:opacity-50"
        >
          {pin.selectedForFilming ? 'On filming day' : busy ? 'Saving…' : 'Mark for filming day'}
        </button>
      </div>
    </div>
  );
}

export function OpportunityMapPanel() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<MapFilters>(() =>
    parseMapFiltersFromSearchParams(new URLSearchParams(searchParams.toString())),
  );
  const [data, setData] = useState<MapOpportunitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('selected'));
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [mapCenter, setMapCenter] = useState({ latitude: 39.0997, longitude: -94.5786 });
  const [fitAllToken, setFitAllToken] = useState(0);
  const [panToSelectedToken, setPanToSelectedToken] = useState(0);
  /** Only advances after a successful load so the map refits against the new pin set, not stale markers. */
  const [appliedFilterFitKey, setAppliedFilterFitKey] = useState('');

  const selectedPin = useMemo(
    () => data?.pins.find((pin) => pin.id === selectedId) ?? null,
    [data?.pins, selectedId],
  );

  const selectedGroup = useMemo(
    () => data?.groups.find((group) => group.opportunities.some((pin) => pin.id === selectedId)) ?? null,
    [data?.groups, selectedId],
  );

  const sortedPins = useMemo(() => {
    if (!data?.pins) return [];
    if (filters.sort === 'nearest') {
      return [...data.pins].sort((a, b) => {
        const dist = (pin: MapOpportunityPin) => {
          const latDiff = pin.latitude - mapCenter.latitude;
          const lngDiff = pin.longitude - mapCenter.longitude;
          return latDiff * latDiff + lngDiff * lngDiff;
        };
        return dist(a) - dist(b);
      });
    }
    return data.pins;
  }, [data?.pins, filters.sort, mapCenter.latitude, mapCenter.longitude]);

  const loadData = useCallback(async (nextFilters: MapFilters) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/inventory/map${buildMapApiQuery(nextFilters)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as MapOpportunitiesResponse;
      setData(json);
      setAppliedFilterFitKey(mapFilterFitKey(nextFilters));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load map data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload map data only when filters change — never on selection/preview/mobile view.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadData(filters);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [filters, loadData]);

  // Sync filters only — never write `selected` into the URL. Next.js useSearchParams +
  // history.replaceState remounts this tree and was resetting the map viewport on every tap.
  useEffect(() => {
    syncMapFiltersToUrl(filters, null);
  }, [filters]);

  function updateFilter<K extends keyof MapFilters>(key: K, value: MapFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters(DEFAULT_MAP_FILTERS);
    setSelectedId(null);
  }

  function selectOpportunity(pin: MapOpportunityPin, source: 'map' | 'list' | 'venue') {
    setSelectedId(pin.id);
    if (source === 'map') {
      setMobileView((current) => mobileViewAfterMarkerSelect(current));
    }
    if (shouldPanToSelection(source)) {
      setPanToSelectedToken((token) => token + 1);
    }
  }

  function closePreview() {
    setSelectedId(null);
  }

  const venueSwitcher =
    selectedGroup && selectedGroup.opportunities.length > 1 ? (
      <div
        className="border border-paper-edge bg-paper p-3 space-y-2"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="text-xs text-paper-muted">
          {selectedGroup.opportunities.length} opportunities at this venue
        </p>
        <div className="flex flex-wrap gap-2">
          {selectedGroup.opportunities.map((pin) => (
            <button
              key={pin.id}
              type="button"
              onClick={() => selectOpportunity(pin, 'venue')}
              aria-current={pin.id === selectedId ? 'true' : undefined}
              className={`text-xs px-2 py-1 border ${
                pin.id === selectedId
                  ? 'border-paper-ink bg-paper-ink text-paper'
                  : 'border-paper-edge text-paper-muted hover:text-paper-ink'
              }`}
            >
              {pin.title.toLowerCase()}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <section>
        <div className="section-mark mb-3">
          <span>content</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tightest lowercase">opportunity map</h1>
        <p className="text-paper-muted mt-2 italic max-w-2xl">
          See where upcoming KC opportunities are located, filter by date and coverage format, and jump into
          inventory review.
        </p>
      </section>

      <section className="border border-paper-edge p-4 space-y-4" aria-label="Map filters">
        <div className="flex flex-wrap gap-2">
          {DATE_PRESET_OPTIONS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => updateFilter('datePreset', preset)}
              aria-pressed={filters.datePreset === preset}
              className={`text-xs px-2 py-1 border ${
                filters.datePreset === preset
                  ? 'border-paper-ink bg-paper-ink text-paper'
                  : 'border-paper-edge text-paper-muted hover:text-paper-ink'
              }`}
            >
              {MAP_DATE_PRESET_LABELS[preset]}
            </button>
          ))}
        </div>

        {filters.datePreset === 'custom' ? (
          <div className="flex flex-wrap gap-3">
            <label className="text-xs space-y-1">
              <span className="text-paper-muted">From</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className="block border border-paper-edge px-2 py-1"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-paper-muted">To</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
                className="block border border-paper-edge px-2 py-1"
              />
            </label>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs space-y-1">
            <span className="text-paper-muted">Coverage format</span>
            <select
              value={filters.coverageFormat}
              onChange={(e) => updateFilter('coverageFormat', e.target.value as MapFilters['coverageFormat'])}
              className="w-full border border-paper-edge px-2 py-1 bg-paper"
            >
              <option value="">All formats</option>
              <option value="unassigned">Unassigned</option>
              {COVERAGE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {COVERAGE_FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-paper-muted">Opportunity status</span>
            <select
              value={filters.state}
              onChange={(e) => updateFilter('state', e.target.value)}
              className="w-full border border-paper-edge px-2 py-1 bg-paper"
            >
              <option value="">All statuses</option>
              {(data?.filterOptions.states ?? []).map((state) => (
                <option key={state} value={state}>
                  {state.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-paper-muted">Category</span>
            <select
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value)}
              className="w-full border border-paper-edge px-2 py-1 bg-paper"
            >
              <option value="">All categories</option>
              {(data?.filterOptions.categories ?? []).map((category) => (
                <option key={category} value={category}>
                  {category.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-paper-muted">Source</span>
            <select
              value={filters.source}
              onChange={(e) => updateFilter('source', e.target.value)}
              className="w-full border border-paper-edge px-2 py-1 bg-paper"
            >
              <option value="">All sources</option>
              {(data?.filterOptions.sources ?? []).map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-paper-muted">Minimum score</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={filters.minScore}
              onChange={(e) => updateFilter('minScore', e.target.value)}
              className="w-full border border-paper-edge px-2 py-1 bg-paper"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-paper-muted">Location status</span>
            <select
              value={filters.locationStatus}
              onChange={(e) =>
                updateFilter('locationStatus', e.target.value as MapFilters['locationStatus'])
              }
              className="w-full border border-paper-edge px-2 py-1 bg-paper"
            >
              <option value="resolved_verified">Resolved & verified only</option>
              <option value="include_needs_review">Include needs review</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex items-end gap-2 pb-1">
            <input
              id="selected-for-filming"
              type="checkbox"
              checked={filters.selectedForFilming}
              onChange={(e) => updateFilter('selectedForFilming', e.target.checked)}
            />
            <span>Selected for filming day</span>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-paper-muted">Sort list</span>
            <select
              value={filters.sort}
              onChange={(e) => updateFilter('sort', e.target.value as MapFilters['sort'])}
              className="w-full border border-paper-edge px-2 py-1 bg-paper"
            >
              {SORT_OPTIONS.map((sort) => (
                <option key={sort} value={sort}>
                  {MAP_SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <button type="button" onClick={resetFilters} className="underline text-paper-muted hover:text-paper-ink">
            Reset filters
          </button>
          <span aria-live="polite">
            {loading ? 'Loading…' : `${data?.count ?? 0} visible on map`}
          </span>
          {!loading && data && data.hiddenUnresolvedCount > 0 ? (
            <span className="text-paper-muted">
              {data.hiddenUnresolvedCount} hidden — location needs review
            </span>
          ) : null}
        </div>
      </section>

      {(data?.hiddenUnresolvedCount ?? 0) > 0 ? (
        <section className="border border-amber-700/40 bg-amber-50/40 p-4 text-sm flex flex-wrap items-center justify-between gap-3">
          <p>
            {data?.hiddenUnresolvedCount} upcoming{' '}
            {data?.hiddenUnresolvedCount === 1 ? 'opportunity is' : 'opportunities are'} not on the map because{' '}
            {data?.hiddenUnresolvedCount === 1 ? 'its location needs' : 'their locations need'} review.
          </p>
          <Link
            href="/review/inventory?locationStatus=needs_review,unresolved"
            className="border border-paper-ink px-3 py-1.5 text-xs hover:bg-paper-muted/10"
          >
            Review locations
          </Link>
        </section>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700 border border-red-300 p-3">{error}</p>
      ) : null}

      <div className="md:hidden flex gap-2">
        <button
          type="button"
          aria-pressed={mobileView === 'map'}
          onClick={() => setMobileView(mobileViewAfterToggle('map'))}
          className={`flex-1 border px-3 py-2 text-sm ${
            mobileView === 'map' ? 'border-paper-ink bg-paper-ink text-paper' : 'border-paper-edge'
          }`}
        >
          Map
        </button>
        <button
          type="button"
          aria-pressed={mobileView === 'list'}
          onClick={() => setMobileView(mobileViewAfterToggle('list'))}
          className={`flex-1 border px-3 py-2 text-sm ${
            mobileView === 'list' ? 'border-paper-ink bg-paper-ink text-paper' : 'border-paper-edge'
          }`}
        >
          List ({data?.count ?? 0})
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        {/* Keep the map mounted on mobile when List is showing so Google Maps does not reset viewport. */}
        <div
          className={`space-y-4 ${
            mobileView === 'list'
              ? 'max-md:absolute max-md:invisible max-md:pointer-events-none max-md:h-0 max-md:overflow-hidden md:static md:visible md:pointer-events-auto md:h-auto md:overflow-visible'
              : ''
          }`}
        >
          <div className="relative">
            <div className="flex items-center justify-end gap-2 mb-2">
              <button
                type="button"
                onClick={() => setFitAllToken((token) => token + 1)}
                className="border border-paper-ink px-3 py-1.5 text-xs hover:bg-paper-muted/10"
              >
                Fit all
              </button>
            </div>
            <OpportunityMapView
              groups={data?.groups ?? []}
              selectedId={selectedId}
              filterFitKey={appliedFilterFitKey}
              fitAllToken={fitAllToken}
              panToSelectedToken={panToSelectedToken}
              onSelectPin={(pin) => selectOpportunity(pin, 'map')}
              onMapCenterChange={(center) => {
                setMapCenter((prev) =>
                  prev.latitude === center.latitude && prev.longitude === center.longitude
                    ? prev
                    : center,
                );
              }}
            />

            {/* Mobile bottom sheet — overlays map; does not resize map or control Map/List toggle */}
            {selectedPin && mobileView === 'map' ? (
              <div
                className="md:hidden absolute inset-x-0 bottom-0 z-20 max-h-[70%] overflow-y-auto p-2 space-y-2 bg-gradient-to-t from-paper via-paper/95 to-transparent pt-8"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {venueSwitcher}
                <PreviewCard
                  pin={selectedPin}
                  onClose={closePreview}
                  onPlanned={() => void loadData(filters)}
                />
              </div>
            ) : null}
          </div>

          {/* Desktop preview below map — selection must not trigger fitBounds */}
          {selectedPin ? (
            <div className="hidden md:block space-y-3">
              {venueSwitcher}
              <PreviewCard
                pin={selectedPin}
                onClose={closePreview}
                onPlanned={() => void loadData(filters)}
              />
            </div>
          ) : null}

          {!loading && (data?.count ?? 0) === 0 ? (
            <p className="text-sm text-paper-muted italic border border-dashed border-paper-edge p-4">
              No mapped opportunities match these filters. Try widening the date range or including needs-review
              locations.
            </p>
          ) : null}
        </div>

        <aside
          className={`border-2 border-paper-edge ${mobileView === 'map' ? 'hidden md:block' : ''}`}
          aria-label="Opportunity list"
        >
          <div className="border-b border-paper-edge px-3 py-2 text-xs uppercase tracking-wider text-paper-muted">
            Visible opportunities
          </div>
          <ul className="max-h-[420px] overflow-y-auto divide-y divide-paper-edge">
            {sortedPins.map((pin) => {
              const active = pin.id === selectedId;
              return (
                <li key={pin.id}>
                  <button
                    type="button"
                    onClick={() => selectOpportunity(pin, 'list')}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full text-left px-3 py-3 text-sm hover:bg-paper-muted/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-ink ${
                      active ? 'bg-paper-muted/10' : ''
                    } ${pin.needsReviewPin ? 'border-l-4 border-amber-600' : ''}`}
                  >
                    <div className="font-medium lowercase">{pin.title.toLowerCase()}</div>
                    <div className="text-xs text-paper-muted mt-1">
                      {formatDateTime(pin.eventDate)} · {pin.locationName ?? 'Location'} · {locationStatusLabel(pin)}
                    </div>
                  </button>
                </li>
              );
            })}
            {!loading && sortedPins.length === 0 ? (
              <li className="px-3 py-6 text-sm text-paper-muted italic">No opportunities to list.</li>
            ) : null}
          </ul>
        </aside>
      </div>
    </div>
  );
}
