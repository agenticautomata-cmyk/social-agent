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
  return d.toLocaleDateString('en-US', DATE_OPTS);
}

export function formatSyncTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  return formatDateTime(iso);
}
