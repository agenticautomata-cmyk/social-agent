import { getLocalCalendarDay } from '../../datetime.js';

/** Reconcile at most once per window inside this TTL. New discoveries may wait this long. */
export const CALENDAR_PROJECTION_TTL_MS = 90_000;

/** Let the serving GET finish (and an immediate reload land) before upsert work starts. */
export const CALENDAR_PROJECTION_BACKGROUND_DELAY_MS = 750;

/** Bounded in-process map — restart may drop it. */
export const CALENDAR_PROJECTION_CACHE_MAX = 48;

export type CalendarProjectionMode = 'fresh' | 'awaited' | 'background';

type WindowEntry = {
  lastReconciledAt: number;
  inflight: Promise<unknown> | null;
};

const windows = new Map<string, WindowEntry>();

let projectionExecutions = 0;

export function calendarProjectionWindowKey(from: Date, to: Date): string {
  return `${getLocalCalendarDay(from)}|${getLocalCalendarDay(to)}`;
}

export function markCalendarProjectionStale(windowKey?: string): void {
  if (!windowKey) {
    for (const entry of windows.values()) entry.lastReconciledAt = 0;
    return;
  }
  const entry = windows.get(windowKey);
  if (entry) entry.lastReconciledAt = 0;
}

export function getCalendarProjectionCacheSize(): number {
  return windows.size;
}

export function getCalendarProjectionExecutionCount(): number {
  return projectionExecutions;
}

export function bumpCalendarProjectionExecutionCount(): void {
  projectionExecutions += 1;
}

export function resetCalendarProjectionFreshnessForTests(): void {
  windows.clear();
  projectionExecutions = 0;
}

function touch(key: string): WindowEntry {
  let entry = windows.get(key);
  if (entry) {
    windows.delete(key);
    windows.set(key, entry);
    return entry;
  }
  entry = { lastReconciledAt: 0, inflight: null };
  windows.set(key, entry);
  while (windows.size > CALENDAR_PROJECTION_CACHE_MAX) {
    const oldest = windows.keys().next().value;
    if (!oldest || oldest === key) break;
    windows.delete(oldest);
  }
  return entry;
}

export function isCalendarProjectionFresh(key: string, now = Date.now()): boolean {
  const entry = windows.get(key);
  if (!entry || entry.lastReconciledAt <= 0) return false;
  return now - entry.lastReconciledAt < CALENDAR_PROJECTION_TTL_MS;
}

export function noteCalendarProjectionReconciled(key: string, now = Date.now()): void {
  const entry = touch(key);
  entry.lastReconciledAt = now;
}

export function getCalendarProjectionInflight(key: string): Promise<unknown> | null {
  return windows.get(key)?.inflight ?? null;
}

export function setCalendarProjectionInflight(key: string, promise: Promise<unknown> | null): void {
  const entry = touch(key);
  entry.inflight = promise;
}

/**
 * Decide whether this read should skip, await, or kick a background reconcile.
 * `hasProjectedRows` is durable creator_calendar_items in the time window.
 */
export function calendarProjectionReadPlan(input: {
  windowKey: string;
  hasProjectedRows: boolean;
  now?: number;
}): CalendarProjectionMode {
  const now = input.now ?? Date.now();
  const entry = windows.get(input.windowKey);
  if (entry?.inflight) {
    return input.hasProjectedRows ? 'background' : 'awaited';
  }
  if (isCalendarProjectionFresh(input.windowKey, now)) return 'fresh';
  if (!input.hasProjectedRows && (!entry || entry.lastReconciledAt <= 0)) return 'awaited';
  return 'background';
}
