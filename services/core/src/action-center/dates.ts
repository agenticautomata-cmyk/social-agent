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

export function dueBucketFor(iso: string | null | undefined, now = new Date()): DueBucket {
  const due = parseDue(iso);
  if (!due) return 'none';

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekEnd = addDays(todayStart, 7);

  if (due < todayStart) return 'overdue';
  if (due >= todayStart && due < todayEnd) return 'due_today';
  if (due < weekEnd) return 'due_this_week';
  return 'later';
}

export function effectiveDueIso(
  primary: string | null | undefined,
  fallback?: string | null,
): string | null {
  return primary ?? fallback ?? null;
}
