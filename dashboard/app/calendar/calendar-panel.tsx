'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../lib/client-api';
import { useBensonRevisionRefresh, notifyLocalChange } from '../../lib/benson-data-refresh';
import {
  CALENDAR_FILTER_PRESETS,
  ITEM_TYPE_ICONS,
  ITEM_TYPE_LABELS,
  type CalendarItemView,
  type CalendarViewMode,
} from '../../lib/calendar-types';

function formatWhen(item: CalendarItemView): string {
  const start = new Date(item.startAt);
  if (item.allDay) return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function groupByDay(items: CalendarItemView[]): Map<string, CalendarItemView[]> {
  const map = new Map<string, CalendarItemView[]>();
  for (const item of items) {
    const key = item.startAt.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

export function CalendarPanel() {
  const [items, setItems] = useState<CalendarItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CalendarViewMode>('agenda');
  const [filterFilming, setFilterFilming] = useState(false);
  const [filterPosting, setFilterPosting] = useState(false);
  const [filterPublic, setFilterPublic] = useState(false);
  const [filterSponsor, setFilterSponsor] = useState(false);
  const [filterSignals, setFilterSignals] = useState(false);
  const [filterGoogleSynced, setFilterGoogleSynced] = useState(false);
  const [filterBensonOnly, setFilterBensonOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const to = new Date();
      to.setDate(to.getDate() + 60);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        includeCompleted: 'false',
      });
      const res = await fetch(clientApiUrl(`/api/calendar/items?${params}`), { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { items: CalendarItemView[] };
      setItems(json.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useBensonRevisionRefresh(['calendar'], () => {
    void reload();
  });

  const filtered = useMemo(() => {
    let list = [...items];
    const typeFilters: string[] = [];
    if (filterFilming) typeFilters.push(...CALENDAR_FILTER_PRESETS.filming);
    if (filterPosting) typeFilters.push(...CALENDAR_FILTER_PRESETS.posting);
    if (filterPublic) typeFilters.push(...CALENDAR_FILTER_PRESETS.publicEvents);
    if (filterSponsor) typeFilters.push(...CALENDAR_FILTER_PRESETS.sponsorDeadlines);
    if (filterSignals) typeFilters.push(...CALENDAR_FILTER_PRESETS.earlySignals);
    if (typeFilters.length) list = list.filter((i) => typeFilters.includes(i.itemType));
    if (filterGoogleSynced) {
      list = list.filter((i) => i.sync?.syncStatus === 'synced' || i.sync?.syncStatus === 'update_available');
    }
    if (filterBensonOnly) {
      list = list.filter(
        (i) =>
          !i.sync?.googleEventId ||
          i.sync.syncStatus === 'benson_only' ||
          i.sync.syncStatus === 'removed_from_google',
      );
    }
    return list.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [
    items,
    filterFilming,
    filterPosting,
    filterPublic,
    filterSponsor,
    filterSignals,
    filterGoogleSynced,
    filterBensonOnly,
  ]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  async function exportGoogle(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(clientApiUrl(`/api/calendar/items/${id}/export-google`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoUpdateEnabled: false, googleReminderMinutes: 30 }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Export failed');
      notifyLocalChange(['calendar']);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusyId(null);
    }
  }

  async function updateGoogle(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(clientApiUrl(`/api/calendar/items/${id}/update-google`), { method: 'POST' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Update failed');
      notifyLocalChange(['calendar']);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmItem(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(clientApiUrl(`/api/calendar/items/${id}/confirm`), { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      notifyLocalChange(['calendar', 'home_briefing']);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center">
        {(['agenda', 'day', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={`px-3 py-1 text-sm border-2 ${view === mode ? 'border-accent bg-accent/10' : 'border-paper-edge'}`}
          >
            {mode}
          </button>
        ))}
        <Link href="/calendar/settings" className="ml-auto text-sm bracket hover:text-accent">
          Google Calendar settings →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-2xs">
        {[
          ['Filming', filterFilming, setFilterFilming],
          ['Posting', filterPosting, setFilterPosting],
          ['Public events', filterPublic, setFilterPublic],
          ['Sponsor', filterSponsor, setFilterSponsor],
          ['Early Signals', filterSignals, setFilterSignals],
          ['Google synced', filterGoogleSynced, setFilterGoogleSynced],
          ['Benson only', filterBensonOnly, setFilterBensonOnly],
        ].map(([label, on, setter]) => (
          <button
            key={label as string}
            type="button"
            onClick={() => (setter as (v: boolean) => void)(!(on as boolean))}
            className={`px-2 py-1 border ${on ? 'border-accent bg-accent/10' : 'border-paper-edge'}`}
          >
            {label as string}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-paper-muted italic">// loading calendar…</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-paper-muted italic">// no calendar items in this window — add from discoveries or Ask Benson</p>
      )}

      {(view === 'agenda' || view === 'week') &&
        [...grouped.entries()].map(([day, dayItems]) => (
          <section key={day} className="space-y-3">
            <h2 className="text-lg font-semibold">
              {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h2>
            <div className="space-y-3">
              {dayItems.map((item) => (
                <CalendarCard
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onConfirm={() => void confirmItem(item.id)}
                  onExport={() => void exportGoogle(item.id)}
                  onUpdateGoogle={() => void updateGoogle(item.id)}
                />
              ))}
            </div>
          </section>
        ))}

      {(view === 'day' || view === 'month') && (
        <div className="space-y-3">
          {filtered.map((item) => (
            <CalendarCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onConfirm={() => void confirmItem(item.id)}
              onExport={() => void exportGoogle(item.id)}
              onUpdateGoogle={() => void updateGoogle(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarCard({
  item,
  busy,
  onConfirm,
  onExport,
  onUpdateGoogle,
}: {
  item: CalendarItemView;
  busy: boolean;
  onConfirm: () => void;
  onExport: () => void;
  onUpdateGoogle: () => void;
}) {
  const syncLabel =
    item.sync?.syncStatus === 'synced'
      ? 'Synced to Google'
      : item.sync?.syncStatus === 'update_available'
        ? 'Update available'
        : item.sync?.syncStatus === 'benson_only' || !item.sync?.googleEventId
          ? 'Benson only'
          : item.sync?.syncStatus ?? 'Benson only';

  return (
    <article className="border-2 border-paper-edge p-4 space-y-2">
      <div className="flex flex-wrap gap-2 items-start justify-between">
        <div>
          <p className="text-2xs text-paper-muted">
            {ITEM_TYPE_ICONS[item.itemType]} {ITEM_TYPE_LABELS[item.itemType]} · {item.planningStatus}
          </p>
          <h3 className="text-lg font-semibold">{item.title}</h3>
          <p className="text-sm text-paper-muted">{formatWhen(item)}</p>
          {item.location && <p className="text-sm">{item.location}</p>}
        </div>
        <span className="text-2xs border border-paper-edge px-2 py-1">{syncLabel}</span>
      </div>

      {item.recommendedAction && (
        <p className="text-sm italic text-paper-muted">→ {item.recommendedAction}</p>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        {item.internalDetailUrl && (
          <Link href={item.internalDetailUrl} className="bracket hover:text-accent">
            Benson record →
          </Link>
        )}
        {item.planningStatus === 'suggested' || item.planningStatus === 'tentative' ? (
          <button type="button" disabled={busy} onClick={onConfirm} className="bracket hover:text-accent">
            Confirm plan
          </button>
        ) : null}
        {item.planningStatus === 'confirmed' &&
          (item.sync?.syncStatus === 'ready_to_export' ||
            item.sync?.syncStatus === 'benson_only' ||
            item.sync?.syncStatus === 'removed_from_google') && (
            <button type="button" disabled={busy} onClick={onExport} className="bracket hover:text-accent">
              Add to Google Calendar
            </button>
          )}
        {item.sync?.syncStatus === 'update_available' && (
          <button type="button" disabled={busy} onClick={onUpdateGoogle} className="bracket hover:text-accent">
            Update Google
          </button>
        )}
      </div>
    </article>
  );
}
