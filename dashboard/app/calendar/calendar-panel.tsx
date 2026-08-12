'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../lib/client-api';
import { useBensonRevisionRefresh, notifyLocalChange } from '../../lib/benson-data-refresh';
import { CREATOR_TIMEZONE } from '../../lib/datetime';
import {
  formatCalendarDayHeading,
  getLocalCalendarDay,
  isPriorCalendarDay,
} from '../../lib/calendar-local-date';
import {
  CALENDAR_FILTER_PRESETS,
  ITEM_TYPE_ICONS,
  ITEM_TYPE_LABELS,
  type CalendarItemView,
  type CalendarViewMode,
} from '../../lib/calendar-types';
import { DiscoverySkipButton } from '../../components/discovery-skip-button';

type WeekendPick = {
  id: string;
  title: string;
  whenLabel: string | null;
  whereLabel: string | null;
  whySummary: string;
  sourceName: string | null;
  viewSourceUrl: string | null;
  categoryLabel: string;
  selected: boolean;
};

type WeekendPayload = {
  weekendLabel: string;
  count: number;
  selectedCount: number;
  emptyReason: string | null;
  items: WeekendPick[];
};

function formatWhen(item: CalendarItemView): string {
  const start = new Date(item.startAt);
  if (item.allDay) {
    return start.toLocaleDateString('en-US', {
      timeZone: CREATOR_TIMEZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  return start.toLocaleString('en-US', {
    timeZone: CREATOR_TIMEZONE,
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
    const key = getLocalCalendarDay(item.startAt);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function validSource(url: string | null | undefined): string | null {
  const u = url?.trim() ?? '';
  if (!u) return null;
  if (!(u.startsWith('http://') || u.startsWith('https://'))) return null;
  return u;
}

function humanStatus(item: CalendarItemView): { headline: string; detail: string | null } {
  const sync = item.sync?.syncStatus ?? null;
  if (sync === 'synced') return { headline: "On Kellie's Google Calendar", detail: 'Synced' };
  if (sync === 'update_available') return { headline: 'Planned', detail: 'Google needs an update' };
  if (sync === 'ready_to_export' && item.planningStatus === 'confirmed') {
    return { headline: 'Planned', detail: 'Ready to add to Google Calendar' };
  }
  if (item.planningStatus === 'suggested') {
    return { headline: 'Suggested by Benson', detail: 'Not on your calendar yet' };
  }
  if (
    (item.planningStatus === 'confirmed' || item.planningStatus === 'tentative') &&
    (sync === 'benson_only' || !item.sync?.googleEventId)
  ) {
    return {
      headline: 'Planned',
      detail: "On Benson's calendar — not exported to Google yet",
    };
  }
  if (item.planningStatus === 'confirmed') {
    return { headline: 'Planned', detail: "Added to Kellie's calendar" };
  }
  return { headline: item.planningStatus.replace(/_/g, ' '), detail: null };
}

function contentItemId(item: CalendarItemView): string | null {
  return item.sourceRecordType === 'content_item' && item.sourceRecordId ? item.sourceRecordId : null;
}

function detailsHref(item: CalendarItemView): string | null {
  const id = contentItemId(item);
  return item.internalDetailUrl ?? (id ? `/review/inventory?id=${id}` : null);
}

function isCalendarReady(item: CalendarItemView): boolean {
  const hasWhen = Boolean(item.startAt);
  if (item.itemType === 'public_event') return Boolean(validSource(item.sourceUrl)) && hasWhen;
  return hasWhen;
}

export function CalendarPanel() {
  const [items, setItems] = useState<CalendarItemView[]>([]);
  const [weekend, setWeekend] = useState<WeekendPayload | null>(null);
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
  const [showPast, setShowPast] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reloadWeekend = useCallback(async () => {
    try {
      const res = await fetch(clientApiUrl('/api/calendar/weekend-things-to-do'), { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as WeekendPayload & { ok?: boolean };
      setWeekend({
        weekendLabel: json.weekendLabel,
        count: json.count,
        selectedCount: json.selectedCount,
        emptyReason: json.emptyReason,
        items: json.items ?? [],
      });
    } catch {
      /* non-fatal */
    }
  }, []);

  const reload = useCallback(
    async (includePast: boolean) => {
      setLoading(true);
      try {
        const from = new Date();
        from.setDate(from.getDate() - (includePast ? 30 : 1));
        const to = new Date();
        to.setDate(to.getDate() + 60);
        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          includeCompleted: 'false',
          ...(includePast ? { includeExpired: 'true' } : {}),
        });
        const res = await fetch(clientApiUrl(`/api/calendar/items?${params}`), { cache: 'no-store' });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as { items: CalendarItemView[] };
        setItems(json.items);
        setError(null);
        await reloadWeekend();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load calendar');
      } finally {
        setLoading(false);
      }
    },
    [reloadWeekend],
  );

  useEffect(() => {
    void reload(showPast);
  }, [reload, showPast]);

  useBensonRevisionRefresh(['calendar'], () => {
    void reload(showPast);
  });

  const filtered = useMemo(() => {
    let list = [...items];
    if (!showPast) {
      list = list.filter((i) => !isPriorCalendarDay(i.startAt));
    }
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
    return list.sort((a, b) =>
      showPast ? b.startAt.localeCompare(a.startAt) : a.startAt.localeCompare(b.startAt),
    );
  }, [
    items,
    showPast,
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
      await reload(showPast);
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
      await reload(showPast);
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
      await reload(showPast);
    } finally {
      setBusyId(null);
    }
  }

  async function dismissCalendarItem(item: CalendarItemView) {
    setBusyId(item.id);
    try {
      const res = await fetch(clientApiUrl(`/api/calendar/items/${item.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planningStatus: 'dismissed' }),
      });
      if (!res.ok) throw new Error(await res.text());
      notifyLocalChange(['calendar', 'home_briefing']);
      await reload(showPast);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss failed');
    } finally {
      setBusyId(null);
    }
  }

  async function addToWeekendList(contentId: string) {
    setBusyId(contentId);
    try {
      const res = await fetch(clientApiUrl(`/api/content-planner/items/${contentId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plan_weekend' }),
      });
      if (!res.ok) throw new Error(await res.text());
      notifyLocalChange(['calendar', 'recommendations']);
      await reloadWeekend();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to weekend list');
    } finally {
      setBusyId(null);
    }
  }

  async function addToThingsToDo(contentId: string) {
    setBusyId(contentId);
    try {
      const res = await fetch(clientApiUrl(`/api/content-planner/items/${contentId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plan_this_week' }),
      });
      if (!res.ok) throw new Error(await res.text());
      notifyLocalChange(['calendar', 'recommendations']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to Things To Do');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleWeekendPick(pick: WeekendPick) {
    setBusyId(pick.id);
    try {
      const res = await fetch(clientApiUrl(`/api/calendar/weekend-things-to-do/${pick.id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected: !pick.selected }),
      });
      if (!res.ok) throw new Error(await res.text());
      notifyLocalChange(['calendar', 'recommendations']);
      await reloadWeekend();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Weekend list update failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <WeekendThingsToDoSection
        weekend={weekend}
        busyId={busyId}
        onToggle={(pick) => void toggleWeekendPick(pick)}
        onRefresh={() => void reloadWeekend()}
      />

      <div className="flex flex-wrap gap-2 items-center">
        {(['agenda', 'day', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={`px-3 py-1 text-sm border-2 min-h-[44px] ${view === mode ? 'border-accent bg-accent/10' : 'border-paper-edge'}`}
          >
            {mode}
          </button>
        ))}
        <Link href="/calendar/settings" className="ml-auto text-sm bracket hover:text-accent min-h-[44px] inline-flex items-center">
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
          ['Suggested only', filterBensonOnly, setFilterBensonOnly],
          ['Past', showPast, setShowPast],
        ].map(([label, on, setter]) => (
          <button
            key={label as string}
            type="button"
            onClick={() => (setter as (v: boolean) => void)(!(on as boolean))}
            className={`px-2 py-2 min-h-[44px] border ${on ? 'border-accent bg-accent/10' : 'border-paper-edge'}`}
          >
            {label as string}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-paper-muted italic">// loading calendar…</p>}
      {!loading && showPast && (
        <p className="text-2xs text-paper-muted italic">Showing past events — this is history, not what to do next.</p>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-paper-muted italic">
          {showPast
            ? '// no past calendar items in this window'
            : '// nothing upcoming yet — add from discoveries or Ask Benson'}
        </p>
      )}

      {(view === 'agenda' || view === 'week') &&
        [...grouped.entries()].map(([day, dayItems]) => (
          <section key={day} className="space-y-3">
            <h2 className="text-lg font-semibold">{formatCalendarDayHeading(day)}</h2>
            <div className="space-y-3">
              {dayItems.map((item) => (
                <CalendarCard
                  key={item.id}
                  item={item}
                  busy={busyId === item.id || busyId === contentItemId(item)}
                  onConfirm={() => void confirmItem(item.id)}
                  onExport={() => void exportGoogle(item.id)}
                  onUpdateGoogle={() => void updateGoogle(item.id)}
                  onDismiss={() => void dismissCalendarItem(item)}
                  onWeekend={() => {
                    const id = contentItemId(item);
                    if (id) void addToWeekendList(id);
                  }}
                  onThingsToDo={() => {
                    const id = contentItemId(item);
                    if (id) void addToThingsToDo(id);
                  }}
                  onActionDone={() => void reload(showPast)}
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
              busy={busyId === item.id || busyId === contentItemId(item)}
              onConfirm={() => void confirmItem(item.id)}
              onExport={() => void exportGoogle(item.id)}
              onUpdateGoogle={() => void updateGoogle(item.id)}
              onDismiss={() => void dismissCalendarItem(item)}
              onWeekend={() => {
                const id = contentItemId(item);
                if (id) void addToWeekendList(id);
              }}
              onThingsToDo={() => {
                const id = contentItemId(item);
                if (id) void addToThingsToDo(id);
              }}
              onActionDone={() => void reload(showPast)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekendThingsToDoSection({
  weekend,
  busyId,
  onToggle,
  onRefresh,
}: {
  weekend: WeekendPayload | null;
  busyId: string | null;
  onToggle: (pick: WeekendPick) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="border-2 border-paper-ink p-4 space-y-4">
      <header className="space-y-1">
        <p className="text-2xs uppercase tracking-wider text-accent">Ready for Kellie</p>
        <h2 className="text-xl font-bold lowercase">things to do this weekend in kc</h2>
        <p className="text-sm text-paper-muted">
          Benson&apos;s curated shortlist for the Fri–Sun window
          {weekend?.weekendLabel ? ` (${weekend.weekendLabel})` : ''}. Not every event — only
          roundup-ready picks. Selected items reuse the Weekend planner list.
        </p>
        {weekend && weekend.selectedCount > 0 ? (
          <p className="text-2xs text-paper-muted">{weekend.selectedCount} selected for the roundup</p>
        ) : null}
      </header>

      {!weekend ? (
        <p className="text-sm text-paper-muted italic">Loading weekend shortlist…</p>
      ) : weekend.count === 0 ? (
        <p className="text-sm text-paper-muted italic border border-dashed border-paper-edge p-4 text-center">
          {weekend.emptyReason}
        </p>
      ) : (
        <div className="space-y-3">
          {weekend.items.map((pick) => (
            <article key={pick.id} className="border border-paper-edge p-4 space-y-3">
              <div>
                <p className="text-2xs uppercase tracking-wider text-paper-muted">{pick.categoryLabel}</p>
                <h3 className="font-bold leading-snug">{pick.title}</h3>
                <div className="text-2xs text-paper-muted mt-1 space-y-0.5">
                  {pick.whenLabel ? <p>{pick.whenLabel}</p> : null}
                  {pick.whereLabel ? <p>{pick.whereLabel}</p> : null}
                  {pick.sourceName ? <p>Source: {pick.sourceName}</p> : null}
                </div>
              </div>
              <p className="text-sm leading-snug">{pick.whySummary}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === pick.id}
                  onClick={() => onToggle(pick)}
                  className={`min-h-[44px] text-xs px-3 py-2 border-2 ${
                    pick.selected
                      ? 'border-accent text-accent'
                      : 'border-paper-ink font-bold hover:bg-paper-ink hover:text-paper'
                  }`}
                >
                  {busyId === pick.id ? '…' : pick.selected ? 'Selected · Remove' : 'Add to weekend list'}
                </button>
                {pick.viewSourceUrl ? (
                  <a
                    href={pick.viewSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge inline-flex items-center"
                  >
                    View source
                  </a>
                ) : null}
                <Link
                  href={`/review/inventory?id=${pick.id}`}
                  className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge inline-flex items-center"
                >
                  Details
                </Link>
                <DiscoverySkipButton
                  contentItemId={pick.id}
                  sourceScreen="calendar_weekend"
                  showSnooze
                  dismissLabel="Dismiss"
                  className="btn-secondary text-2xs py-2 min-h-[44px] px-3"
                  onSkipped={onRefresh}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CalendarCard({
  item,
  busy,
  onConfirm,
  onExport,
  onUpdateGoogle,
  onDismiss,
  onWeekend,
  onThingsToDo,
  onActionDone,
}: {
  item: CalendarItemView;
  busy: boolean;
  onConfirm: () => void;
  onExport: () => void;
  onUpdateGoogle: () => void;
  onDismiss: () => void;
  onWeekend: () => void;
  onThingsToDo: () => void;
  onActionDone: () => void;
}) {
  const status = humanStatus(item);
  const source = validSource(item.sourceUrl);
  const ready = isCalendarReady(item);
  const contentId = contentItemId(item);
  const detail = detailsHref(item);
  const sync = item.sync?.syncStatus ?? null;

  const showConfirm =
    ready && (item.planningStatus === 'suggested' || item.planningStatus === 'tentative');
  const showAddGoogle =
    item.planningStatus === 'confirmed' &&
    (sync === 'ready_to_export' ||
      sync === 'benson_only' ||
      sync === 'removed_from_google' ||
      !item.sync?.googleEventId);
  const showUpdate = sync === 'update_available';

  return (
    <article className="border-2 border-paper-edge p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-start justify-between">
        <div className="min-w-0">
          <p className="text-2xs text-paper-muted">
            {ITEM_TYPE_ICONS[item.itemType]} {ITEM_TYPE_LABELS[item.itemType]}
          </p>
          <h3 className="text-lg font-semibold leading-snug">{item.title}</h3>
          <p className="text-sm text-paper-muted">{formatWhen(item)}</p>
          {item.location && <p className="text-sm">{item.location}</p>}
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-2xs font-bold uppercase tracking-wider">{status.headline}</p>
          {status.detail ? <p className="text-2xs text-paper-muted">{status.detail}</p> : null}
        </div>
      </div>

      {!ready && item.itemType === 'public_event' ? (
        <p className="text-2xs text-accent">
          Not calendar-ready — missing a usable source. Inspect details or dismiss.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        {showConfirm ? (
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="btn-primary text-xs min-h-[44px] px-3"
          >
            {busy ? '…' : 'Confirm plan'}
          </button>
        ) : null}
        {showAddGoogle ? (
          <button
            type="button"
            disabled={busy}
            onClick={onExport}
            className="btn-primary text-xs min-h-[44px] px-3"
          >
            {busy ? '…' : 'Add to calendar'}
          </button>
        ) : null}
        {showUpdate ? (
          <button
            type="button"
            disabled={busy}
            onClick={onUpdateGoogle}
            className="btn-primary text-xs min-h-[44px] px-3"
          >
            {busy ? '…' : 'Update Google'}
          </button>
        ) : null}
        {contentId && item.itemType === 'public_event' ? (
          <button
            type="button"
            disabled={busy}
            onClick={onWeekend}
            className="min-h-[44px] text-xs px-3 py-2 border-2 border-paper-ink"
          >
            Add to weekend list
          </button>
        ) : null}
        {contentId ? (
          <button
            type="button"
            disabled={busy}
            onClick={onThingsToDo}
            className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge"
          >
            Add to Things To Do
          </button>
        ) : null}
        {source ? (
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge inline-flex items-center"
          >
            View source
          </a>
        ) : null}
        {detail ? (
          <Link href={detail} className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge inline-flex items-center">
            Details
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {contentId ? (
          <DiscoverySkipButton
            contentItemId={contentId}
            sourceScreen="calendar"
            showSnooze
            dismissLabel="Dismiss"
            className="btn-secondary text-2xs py-2 min-h-[44px] px-3"
            onSkipped={() => {
              void onDismiss();
              onActionDone();
            }}
          />
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
              className="btn-secondary text-2xs py-2 min-h-[44px] px-3"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </article>
  );
}
