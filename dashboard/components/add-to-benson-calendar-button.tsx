'use client';

import { useState } from 'react';
import { clientApiUrl } from '../lib/client-api';
import { notifyLocalChange } from '../lib/benson-data-refresh';
import type { CalendarItemType } from '../lib/calendar-types';

type Props = {
  title: string;
  sourceRecordType?: string;
  sourceRecordId?: string;
  sourceUrl?: string;
  internalDetailUrl?: string;
  defaultItemType?: CalendarItemType;
  defaultStartAt?: string;
  location?: string;
  className?: string;
};

const CREATOR_ACTIONS = [
  { id: 'attend', label: 'Attend', itemType: 'public_event' as CalendarItemType },
  { id: 'film', label: 'Film', itemType: 'content_filming' as CalendarItemType },
  { id: 'post', label: 'Post', itemType: 'content_posting' as CalendarItemType },
  { id: 'follow_up', label: 'Follow up', itemType: 'sponsor_outreach' as CalendarItemType },
  { id: 'research', label: 'Research', itemType: 'creator_task' as CalendarItemType },
  { id: 'reminder_only', label: 'Reminder only', itemType: 'creator_task' as CalendarItemType },
  { id: 'custom', label: 'Custom', itemType: 'creator_task' as CalendarItemType },
];

export function AddToBensonCalendarButton({
  title,
  sourceRecordType,
  sourceRecordId,
  sourceUrl,
  internalDetailUrl,
  defaultItemType = 'public_event',
  defaultStartAt,
  location,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState(CREATOR_ACTIONS[0]!.id);
  const [startAt, setStartAt] = useState(
    defaultStartAt ?? new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  );
  const [itemType, setItemType] = useState<CalendarItemType>(defaultItemType);
  const [notes, setNotes] = useState('');

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const selected = CREATOR_ACTIONS.find((a) => a.id === action) ?? CREATOR_ACTIONS[0]!;
      const res = await fetch(clientApiUrl('/api/calendar/items'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          itemType: action === 'custom' ? itemType : selected.itemType,
          sourceRecordType,
          sourceRecordId,
          sourceUrl,
          internalDetailUrl,
          startAt: new Date(startAt).toISOString(),
          location,
          creatorAction: action,
          notes: notes || undefined,
          planningStatus: 'tentative',
          timezone: 'America/Chicago',
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      notifyLocalChange(['calendar', 'home_briefing']);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={className ?? 'bracket text-sm hover:text-accent'}>
        Add to Benson Calendar
      </button>
    );
  }

  return (
    <div className="border-2 border-paper-edge p-4 space-y-3 text-sm">
      <p className="font-semibold">Add “{title}” to Benson Calendar</p>
      <label className="block space-y-1">
        <span className="text-2xs text-paper-muted">Plan type</span>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-full border border-paper-edge bg-transparent p-2"
        >
          {CREATOR_ACTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {action === 'custom' && (
        <label className="block space-y-1">
          <span className="text-2xs text-paper-muted">Item type</span>
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value as CalendarItemType)}
            className="w-full border border-paper-edge bg-transparent p-2"
          >
            <option value="public_event">Public event</option>
            <option value="content_filming">Filming</option>
            <option value="content_posting">Posting</option>
            <option value="sponsor_outreach">Sponsor outreach</option>
            <option value="creator_task">Creator task</option>
            <option value="early_signal">Early signal</option>
          </select>
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-2xs text-paper-muted">Date & time</span>
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className="w-full border border-paper-edge bg-transparent p-2"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-2xs text-paper-muted">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-paper-edge bg-transparent p-2"
        />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void submit()} className="btn-primary">
          Save to Benson
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="bracket">
          Cancel
        </button>
      </div>
      <p className="text-2xs text-paper-muted italic">Google Calendar export is a separate opt-in step after you confirm the plan.</p>
    </div>
  );
}
