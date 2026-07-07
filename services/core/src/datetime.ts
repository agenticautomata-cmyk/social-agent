import { env } from './env.js';

/** Central Time — CST in winter, CDT in summer. */
export const DEFAULT_CREATOR_TIMEZONE = 'America/Chicago';

export function getCreatorTimezone(): string {
  return env.CREATOR_TIMEZONE?.trim() || DEFAULT_CREATOR_TIMEZONE;
}

export function timezoneShortLabel(timezone: string, date = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', {
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

function localCalendarDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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

  const postedDay = localCalendarDay(posted, timezone);
  const todayDay = localCalendarDay(now, timezone);
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
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(date),
  );
}
