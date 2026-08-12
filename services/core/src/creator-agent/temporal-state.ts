/**
 * Batch 3 — single currentness authority for events/promotions.
 *
 * Evidence truth (dates/provenance) stays stored. This module only decides
 * whether an occurrence is still current/upcoming for operator surfaces.
 *
 * Timezone: America/Chicago (KC) unless an explicit authoritative timezone
 * is supplied. Date-only markers use Chicago day boundaries — never
 * server-local midnight and never "retention days" as currentness.
 */

import { DEFAULT_CREATOR_TIMEZONE, getLocalCalendarDay } from '../datetime.js';

export const DEFAULT_TEMPORAL_TIMEZONE = DEFAULT_CREATOR_TIMEZONE;

export type TemporalState = 'current' | 'upcoming' | 'expired' | 'unknown';

export type TemporalStateInput = {
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  timezone?: string | null;
  now?: Date;
};

export type TemporalStateResult = {
  state: TemporalState;
  effectiveStart: Date | null;
  effectiveEnd: Date | null;
  timezone: string;
  /** True when start/end looked like a date-only stamp (midnight UTC). */
  dateOnly: boolean;
  reasons: string[];
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC-midnight stamps are treated as date-only calendar days (feed convention). */
export function isDateOnlyTimestamp(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

function calendarDayKey(date: Date, timezone: string): string {
  return isDateOnlyTimestamp(date)
    ? date.toISOString().slice(0, 10)
    : getLocalCalendarDay(date, timezone);
}

/** Last millisecond still on `dayKey` (YYYY-MM-DD) in `timezone`. */
export function endOfLocalDayKey(dayKey: string, timezone: string): Date {
  const anchor = Date.parse(`${dayKey}T12:00:00.000Z`);
  let lo = anchor - 14 * 3_600_000;
  let hi = anchor + 36 * 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (getLocalCalendarDay(new Date(mid), timezone) <= dayKey) lo = mid;
    else hi = mid;
  }
  return new Date(lo);
}

/** First millisecond on `dayKey` (YYYY-MM-DD) in `timezone`. */
export function startOfLocalDayKey(dayKey: string, timezone: string): Date {
  const anchor = Date.parse(`${dayKey}T12:00:00.000Z`);
  let lo = anchor - 14 * 3_600_000;
  let hi = anchor + 36 * 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (getLocalCalendarDay(new Date(mid), timezone) < dayKey) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

/**
 * End of the calendar day that `date` represents in `timezone`.
 * For date-only UTC midnight values, the UTC YYYY-MM-DD is the intended local day.
 */
export function endOfLocalCalendarDay(date: Date, timezone: string): Date {
  return endOfLocalDayKey(calendarDayKey(date, timezone), timezone);
}

function startOfLocalCalendarDay(date: Date, timezone: string): Date {
  return startOfLocalDayKey(calendarDayKey(date, timezone), timezone);
}

/**
 * Effective end for currency:
 * prefer endsAt, else startsAt.
 * Date-only stamps expand to end-of-Chicago-day so Aug 8 date-only stays
 * current through Aug 8 local, then expires immediately after.
 */
export function resolveEffectiveEnd(
  startsAt: Date | null,
  endsAt: Date | null,
  timezone: string,
): { effectiveEnd: Date | null; dateOnly: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (endsAt) {
    const dateOnly = isDateOnlyTimestamp(endsAt);
    const effectiveEnd = dateOnly ? endOfLocalCalendarDay(endsAt, timezone) : endsAt;
    reasons.push(dateOnly ? 'end:date_only_chicago_eod' : 'end:explicit_timestamp');
    return { effectiveEnd, dateOnly, reasons };
  }
  if (startsAt) {
    const dateOnly = isDateOnlyTimestamp(startsAt);
    const effectiveEnd = dateOnly ? endOfLocalCalendarDay(startsAt, timezone) : startsAt;
    reasons.push(dateOnly ? 'end:fallback_start_date_only_chicago_eod' : 'end:fallback_start_timestamp');
    return { effectiveEnd, dateOnly, reasons };
  }
  return { effectiveEnd: null, dateOnly: false, reasons: ['end:none'] };
}

export function evaluateTemporalState(input: TemporalStateInput): TemporalStateResult {
  const timezone = (input.timezone?.trim() || DEFAULT_TEMPORAL_TIMEZONE);
  const now = input.now ?? new Date();
  const starts = toDate(input.startsAt);
  const ends = toDate(input.endsAt);
  const reasons: string[] = [];

  if (!starts && !ends) {
    return {
      state: 'unknown',
      effectiveStart: null,
      effectiveEnd: null,
      timezone,
      dateOnly: false,
      reasons: ['temporal:unknown_no_dates'],
    };
  }

  const { effectiveEnd, dateOnly, reasons: endReasons } = resolveEffectiveEnd(
    starts,
    ends,
    timezone,
  );
  reasons.push(...endReasons);

  let effectiveStart = starts;
  if (starts && isDateOnlyTimestamp(starts)) {
    effectiveStart = startOfLocalCalendarDay(starts, timezone);
    reasons.push('start:date_only_chicago_sod');
  }

  if (effectiveEnd && effectiveEnd.getTime() < now.getTime()) {
    reasons.push('temporal:expired');
    return {
      state: 'expired',
      effectiveStart,
      effectiveEnd,
      timezone,
      dateOnly,
      reasons,
    };
  }

  if (effectiveStart && effectiveStart.getTime() > now.getTime()) {
    reasons.push('temporal:upcoming');
    return {
      state: 'upcoming',
      effectiveStart,
      effectiveEnd,
      timezone,
      dateOnly,
      reasons,
    };
  }

  reasons.push('temporal:current');
  return {
    state: 'current',
    effectiveStart,
    effectiveEnd,
    timezone,
    dateOnly,
    reasons,
  };
}

export function isTemporallyCurrent(
  input: TemporalStateInput,
): boolean {
  const state = evaluateTemporalState(input).state;
  return state === 'current' || state === 'upcoming';
}
