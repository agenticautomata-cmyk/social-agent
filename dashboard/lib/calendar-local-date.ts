import { CREATOR_TIMEZONE } from './datetime';

/**
 * YYYY-MM-DD calendar day string in the creator's local timezone (America/Chicago by
 * default). Use this instead of `isoString.slice(0, 10)` for any day-bucketing or
 * "is this past/today/future" logic — the raw ISO slice reflects UTC, which shifts an
 * evening Central-time event onto the next UTC day and mis-groups/mis-labels it.
 */
export function getLocalCalendarDay(date: Date | string, timezone: string = CREATOR_TIMEZONE): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** True when `date` falls on a creator-local calendar day strictly before `now`. */
export function isPriorCalendarDay(
  date: Date | string,
  now: Date | string = new Date(),
  timezone: string = CREATOR_TIMEZONE,
): boolean {
  return getLocalCalendarDay(date, timezone) < getLocalCalendarDay(now, timezone);
}

/** True when `date` falls on the same creator-local calendar day as `now`. */
export function isSameCalendarDay(
  date: Date | string,
  now: Date | string = new Date(),
  timezone: string = CREATOR_TIMEZONE,
): boolean {
  return getLocalCalendarDay(date, timezone) === getLocalCalendarDay(now, timezone);
}

/**
 * Human-readable heading ("Sunday, July 26") for a `YYYY-MM-DD` day key produced by
 * `getLocalCalendarDay`. Anchors at UTC noon before formatting so the timezone
 * conversion can never push the displayed date onto a neighboring day.
 */
export function formatCalendarDayHeading(day: string, timezone: string = CREATOR_TIMEZONE): string {
  const [year, month, date] = day.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(anchor);
}
