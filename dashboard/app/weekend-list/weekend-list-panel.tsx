'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';
import { notifyLocalChange, useBensonRevisionRefresh } from '../../lib/benson-data-refresh';
import { useActionToast } from '../../components/action-toast';

type WeekendListItem = {
  id: string;
  title: string;
  dateLabel: string;
  startTimeLabel: string | null;
  venue: string | null;
  city: string | null;
  address: string | null;
  description: string | null;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  verificationNote: string | null;
  notes: string | null;
  spanNote: string | null;
};

type WeekendListDay = {
  key: 'friday' | 'saturday' | 'sunday';
  heading: string;
  items: WeekendListItem[];
};

type PastWeekend = {
  friday: string;
  sunday: string;
  label: string;
  selectedCount: number;
};

type WeekendListPayload = {
  title: string;
  rangeLabel: string;
  rangeLabelFull: string;
  friday: string;
  selectedCount: number;
  emptyMessage: string;
  outsideWindowCount: number;
  days: WeekendListDay[];
  flyerBrief: string;
  fullList: string;
  pastWeekends: PastWeekend[];
};

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function WeekendListPanel() {
  const [data, setData] = useState<WeekendListPayload | null>(null);
  const [friday, setFriday] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const { showToast } = useActionToast();

  const reload = useCallback(async (nextFriday?: string | null) => {
    const key = nextFriday === undefined ? friday : nextFriday;
    setLoading(true);
    setError(null);
    try {
      const qs = key ? `?friday=${encodeURIComponent(key)}` : '';
      const res = await fetch(clientApiUrl(`/api/calendar/weekend-list${qs}`), { cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load weekend list (${res.status})`);
      const json = (await res.json()) as WeekendListPayload & { ok?: boolean };
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load weekend list');
    } finally {
      setLoading(false);
    }
  }, [friday]);

  useBensonRevisionRefresh(['calendar', 'recommendations'], () => void reload());

  useEffect(() => {
    void reload();
  }, [reload]);

  async function copyFlyer() {
    if (!data?.flyerBrief) return;
    try {
      await copyText(data.flyerBrief);
      showToast({ title: 'Copied flyer brief', nextStep: 'Paste it into ChatGPT for this week’s graphics.' });
    } catch {
      showToast({ title: 'Copy failed', nextStep: 'Select the text and copy it manually.', tone: 'error' });
    }
  }

  async function copyFull() {
    if (!data?.fullList) return;
    try {
      await copyText(data.fullList);
      showToast({ title: 'Copied full list', nextStep: 'Operator details are on the clipboard.' });
    } catch {
      showToast({ title: 'Copy failed', nextStep: 'Select the text and copy it manually.', tone: 'error' });
    }
  }

  async function removeItem(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(clientApiUrl(`/api/calendar/weekend-things-to-do/${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected: false }),
      });
      if (!res.ok) throw new Error(`Could not remove (${res.status})`);
      notifyLocalChange(['calendar', 'recommendations']);
      showToast({ title: 'Removed', nextStep: 'It’s off this weekend’s list.' });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove');
    } finally {
      setBusyId(null);
    }
  }

  const viewingPast = Boolean(friday);

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <div className="section-mark">
          <span>// § weekend list</span>
        </div>
        <p className="text-2xs uppercase tracking-wider text-accent">Ready for Kellie</p>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tightest cursor lowercase leading-tight">
          things to do this weekend in kc
        </h1>
        <p className="text-sm text-paper-muted">
          {data?.rangeLabelFull ?? data?.rangeLabel ?? 'This weekend'}
          {data ? ` · ${data.selectedCount} selected` : ''}
        </p>
        <p className="text-xs text-paper-muted max-w-2xl">
          Kellie picks. Benson organizes. Copy the flyer brief into ChatGPT for this week’s graphics —
          Benson does not generate the flyer.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyFlyer()} className="btn-primary text-xs min-h-[44px] px-3">
            Copy flyer brief
          </button>
          <button
            type="button"
            onClick={() => void copyFull()}
            className="min-h-[44px] text-xs px-3 py-2 border-2 border-paper-ink"
          >
            Copy full list
          </button>
          <Link
            href="/calendar"
            className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge inline-flex items-center"
          >
            Calendar
          </Link>
        </div>
      </header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-paper-muted italic">Loading weekend list…</p> : null}

      {data && data.selectedCount === 0 ? (
        <p className="text-sm text-paper-muted italic border border-dashed border-paper-edge p-4 whitespace-pre-line">
          {data.emptyMessage}
        </p>
      ) : null}

      {data?.outsideWindowCount ? (
        <p className="text-2xs text-paper-muted">
          {data.outsideWindowCount} other Weekend pick{data.outsideWindowCount === 1 ? '' : 's'} sit on
          other dates — still on Calendar/planner, not this Fri–Sun list.
        </p>
      ) : null}

      {data
        ? data.days.map((day) =>
            day.items.length === 0 ? null : (
              <section key={day.key} className="space-y-3">
                <h2 className="text-lg font-bold tracking-wide">{day.heading}</h2>
                <ul className="space-y-3">
                  {day.items.map((item) => (
                    <li key={item.id} className="glass-panel p-4 space-y-2">
                      <div>
                        <h3 className="font-bold leading-snug line-clamp-2 break-words min-w-0">{item.title}</h3>
                        <p className="text-2xs text-paper-muted mt-1">
                          {[item.dateLabel, item.startTimeLabel, item.category].filter(Boolean).join(' · ')}
                        </p>
                        {item.spanNote ? <p className="text-2xs text-paper-muted">{item.spanNote}</p> : null}
                        <p className="text-sm mt-1">
                          {[item.venue, item.city].filter(Boolean).join(' · ')}
                        </p>
                        {item.address ? <p className="text-2xs text-paper-muted">{item.address}</p> : null}
                      </div>
                      {item.description ? <p className="text-sm text-paper-soft leading-snug">{item.description}</p> : null}
                      {item.sourceName ? <p className="text-2xs text-paper-muted">Source: {item.sourceName}</p> : null}
                      {item.notes ? <p className="text-2xs text-paper-muted">Note: {item.notes}</p> : null}
                      {item.verificationNote ? (
                        <p className="text-2xs text-amber-200/90">{item.verificationNote}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge inline-flex items-center"
                          >
                            View source
                          </a>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void removeItem(item.id)}
                          className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge"
                        >
                          {busyId === item.id ? '…' : 'Remove'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )
        : null}

      {data && data.pastWeekends.length > 0 && !viewingPast ? (
        <div className="pt-2 border-t border-dashed border-paper-edge space-y-2">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-2xs uppercase tracking-wider text-paper-muted hover:text-accent"
          >
            Past weekends
          </button>
          {showPast ? (
            <ul className="space-y-1">
              {data.pastWeekends.map((past) => (
                <li key={past.friday}>
                  <button
                    type="button"
                    className="text-sm hover:text-accent"
                    onClick={() => {
                      setFriday(past.friday);
                      void reload(past.friday);
                    }}
                  >
                    {past.label} · {past.selectedCount} selected
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {viewingPast ? (
        <button
          type="button"
          className="text-sm hover:text-accent"
          onClick={() => {
            setFriday(null);
            void reload(null);
          }}
        >
          ← This weekend
        </button>
      ) : null}
    </section>
  );
}
