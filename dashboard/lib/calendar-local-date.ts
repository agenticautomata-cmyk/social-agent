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

/**
 * UTC calendar date encoded in a date-only / all-day `startAt` (YYYY-MM-DDT00:00:00Z).
 * Do not convert through America/Chicago — that shifts the displayed day back by one.
 */
export function getAllDayCalendarDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Day-bucket key for a Calendar item. All-day rows use the UTC date encoded in
 * `startAt`; timed rows keep America/Chicago local-day semantics.
 * Only `allDay === true` selects the date-only branch (not UTC midnight alone).
 */
export function getCalendarItemDayKey(
  item: { startAt: string; allDay: boolean },
  timezone: string = CREATOR_TIMEZONE,
): string {
  if (item.allDay) return getAllDayCalendarDay(item.startAt);
  return getLocalCalendarDay(item.startAt, timezone);
}

/**
 * Compact "when" label for an all-day Calendar row (e.g. "Fri, Aug 28").
 * Formats the UTC-encoded date so Chicago conversion cannot shift the day.
 */
export function formatCalendarAllDayWhen(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** True when `date` falls on a creator-local calendar day strictly before `now`. */
export function isPriorCalendarDay(
  date: Date | string,
  now: Date | string = new Date(),
  timezone: string = CREATOR_TIMEZONE,
): boolean {
  return getLocalCalendarDay(date, timezone) < getLocalCalendarDay(now, timezone);
}

/**
 * True when a Calendar item's grouping day is strictly before `now`'s creator-local day.
 * Uses the same day-key rules as `getCalendarItemDayKey` / day bucketing (all-day = UTC
 * encoded date; timed = America/Chicago).
 */
export function isPriorCalendarItemDay(
  item: { startAt: string; allDay: boolean },
  now: Date | string = new Date(),
  timezone: string = CREATOR_TIMEZONE,
): boolean {
  return getCalendarItemDayKey(item, timezone) < getLocalCalendarDay(now, timezone);
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

/** Compact sticky-nav label ("MONDAY · AUG 17") for a `YYYY-MM-DD` day key. */
export function formatCalendarDayNavLabel(day: string, timezone: string = CREATOR_TIMEZONE): string {
  const [year, month, date] = day.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1, 12));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(anchor);
  const monthDay = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  }).format(anchor);
  return `${weekday.toUpperCase()} · ${monthDay.toUpperCase()}`;
}
