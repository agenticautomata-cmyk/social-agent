/** Monday 00:00 local for the week containing `date`. */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

/** Next Saturday on or after `date`. */
export function nextSaturday(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const daysUntil = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
  d.setDate(d.getDate() + daysUntil);
  return d;
}

export function isDateInWeek(dateStr: string, weekStart: Date): boolean {
  const d = parseDateOnly(dateStr);
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 7);
  return d >= start && d < end;
}
