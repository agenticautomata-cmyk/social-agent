/** Central Time — CST in winter, CDT in summer (America/Chicago). */
export const CREATOR_TIMEZONE =
  process.env.NEXT_PUBLIC_CREATOR_TIMEZONE ?? 'America/Chicago';

const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: CREATOR_TIMEZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: CREATOR_TIMEZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', DATE_TIME_OPTS);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  // Date-only values (e.g. "2026-09-26") serialize as midnight UTC. Converting that
  // exact instant to a negative-UTC-offset timezone like America/Chicago shifts the
  // displayed day backward by one (Sep 26 00:00 UTC -> Sep 25 evening in Chicago).
  // Anchor genuinely date-only timestamps at UTC noon before formatting so the
  // timezone conversion can never cross a calendar-day boundary. Real timestamps
  // with an actual time-of-day are left untouched and shown in Chicago local time.
  const isUtcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  const anchored = isUtcMidnight
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12))
    : d;
  return anchored.toLocaleDateString('en-US', DATE_OPTS);
}

export function formatSyncTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  return formatDateTime(iso);
}
