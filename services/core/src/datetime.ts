import { env } from './env.js';

/** Central Time — CST in winter, CDT in summer. */
export const DEFAULT_CREATOR_TIMEZONE = 'America/Chicago';

/** Conservative cap — Benson uses a tiny set of timezone/locale/option keys in practice. */
const FORMATTER_CACHE_MAX = 64;

type FormatterCacheKey = string;

const formatterCache = new Map<FormatterCacheKey, Intl.DateTimeFormat>();

function stableOptionsKey(options: Intl.DateTimeFormatOptions): string {
  const entries = Object.entries(options).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function formatterCacheKey(locale: string, options: Intl.DateTimeFormatOptions): FormatterCacheKey {
  return `${locale}\0${options.timeZone ?? ''}\0${stableOptionsKey(options)}`;
}

function getCachedDateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = formatterCacheKey(locale, options);
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const fmt = new Intl.DateTimeFormat(locale, options);
  if (formatterCache.size >= FORMATTER_CACHE_MAX) {
    const oldest = formatterCache.keys().next().value;
    if (oldest) formatterCache.delete(oldest);
  }
  formatterCache.set(key, fmt);
  return fmt;
}

/** @internal Test helper — reset module formatter cache between cases. */
export function clearDateTimeFormatCacheForTests(): void {
  formatterCache.clear();
}

/** @internal Test helper — inspect cache size after repeated calls. */
export function getDateTimeFormatCacheSizeForTests(): number {
  return formatterCache.size;
}

export function getCreatorTimezone(): string {
  return env.CREATOR_TIMEZONE?.trim() || DEFAULT_CREATOR_TIMEZONE;
}

export function timezoneShortLabel(timezone: string, date = new Date()): string {
  const part = getCachedDateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'short',
  })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timezone;
}

export function formatIsoDateTime(
  iso: string | null | undefined,
  timezone = getCreatorTimezone(),
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function formatIsoDate(
  iso: string | null | undefined,
  timezone = getCreatorTimezone(),
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getLocalCalendarDay(date: Date, timezone = getCreatorTimezone()): string {
  return getCachedDateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** True when `iso` falls on the same creator-local calendar day as `now`. */
export function isSameCreatorCalendarDay(
  iso: string | Date | null | undefined,
  now = new Date(),
  timezone = getCreatorTimezone(),
): boolean {
  if (!iso) return false;
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return false;
  return getLocalCalendarDay(date, timezone) === getLocalCalendarDay(now, timezone);
}

/** True when `iso` is before today's creator-local calendar day. */
export function isPriorCreatorCalendarDay(
  iso: string | Date | null | undefined,
  now = new Date(),
  timezone = getCreatorTimezone(),
): boolean {
  if (!iso) return false;
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return false;
  return getLocalCalendarDay(date, timezone) < getLocalCalendarDay(now, timezone);
}

export type CreatorNowClock = {
  isoUtc: string;
  localDateTime: string;
  localDate: string;
  weekday: string;
  hour: number;
  minute: number;
  partOfDay: 'morning' | 'afternoon' | 'evening';
  timezone: string;
  timezoneAbbr: string;
};

/** Current date/time in the creator's timezone — Benson's clock. */
export function getCreatorNowClock(now = new Date()): CreatorNowClock {
  const timezone = getCreatorTimezone();
  const parts = getCachedDateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Unknown';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);

  return {
    isoUtc: now.toISOString(),
    localDateTime: formatIsoDateTime(now.toISOString(), timezone),
    localDate: getLocalCalendarDay(now, timezone),
    weekday,
    hour,
    minute,
    partOfDay: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening',
    timezone,
    timezoneAbbr: timezoneShortLabel(timezone, now),
  };
}

/**
 * Human label for when something was posted, in the creator's timezone:
 * "this morning", "last night", "yesterday", "3 days ago", "Jun 2".
 */
export function describeRecency(
  iso: string,
  timezone = getCreatorTimezone(),
  now = new Date(),
): string {
  const posted = new Date(iso);
  if (Number.isNaN(posted.getTime())) return 'recently';

  const postedDay = getLocalCalendarDay(posted, timezone);
  const todayDay = getLocalCalendarDay(now, timezone);
  const dayDiff = Math.round(
    (Date.parse(todayDay) - Date.parse(postedDay)) / (24 * 60 * 60 * 1000),
  );
  const postedHour = localHourInTimezone(posted, timezone);

  if (dayDiff <= 0) {
    if (postedHour < 12) return 'this morning';
    if (postedHour < 17) return 'this afternoon';
    return 'tonight';
  }
  if (dayDiff === 1) {
    return postedHour >= 17 ? 'last night' : 'yesterday';
  }
  if (dayDiff <= 6) return `${dayDiff} days ago`;
  return formatIsoDate(iso, timezone);
}

export function localHourInTimezone(
  date = new Date(),
  timezone = getCreatorTimezone(),
): number {
  return Number(
    getCachedDateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(date),
  );
}
