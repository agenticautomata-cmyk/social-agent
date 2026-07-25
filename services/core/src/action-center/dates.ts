import { getCreatorTimezone, getLocalCalendarDay } from '../datetime.js';

export type DueBucket = 'overdue' | 'due_today' | 'due_this_week' | 'later' | 'none';

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  const e = startOfDay(d);
  e.setDate(e.getDate() + 1);
  return e;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function parseDue(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Due buckets use the creator timezone (America/Chicago), not the server clock. */
export function dueBucketFor(iso: string | null | undefined, now = new Date()): DueBucket {
  const due = parseDue(iso);
  if (!due) return 'none';

  const tz = getCreatorTimezone();
  const dueDay = getLocalCalendarDay(due, tz);
  const todayDay = getLocalCalendarDay(now, tz);
  const dayDiff = Math.round(
    (Date.parse(todayDay) - Date.parse(dueDay)) / (24 * 60 * 60 * 1000),
  );

  if (dayDiff > 0) return 'overdue';
  if (dayDiff === 0) return 'due_today';
  if (dayDiff >= -6) return 'due_this_week';
  return 'later';
}

export function effectiveDueIso(
  primary: string | null | undefined,
  fallback?: string | null,
): string | null {
  return primary ?? fallback ?? null;
}
