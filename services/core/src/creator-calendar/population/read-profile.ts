/** In-process span timings for Calendar GET / projection. Not an HTTP cache. */

export type CalendarReadSpans = {
  totalMs: number;
  projectionMs: number;
  inventoryLoadMs: number;
  inventoryNormalizeMs: number;
  inventorySkipMs: number;
  inventoryEligibilityMs: number;
  curatorLoadMs: number;
  curatorEligibilityMs: number;
  existingWindowLoadMs: number;
  eligibilityDedupeMs: number;
  dismissedLookupMs: number;
  upsertsMs: number;
  calendarRowsReadMs: number;
  syncMapMs: number;
  selectionOverlayMs: number;
  categoryEnrichMs: number;
  displayDedupeMs: number;
  snoozeFilterMs: number;
  inventoryCandidateCount: number;
  curatorCandidateCount: number;
  upsertCount: number;
  calendarRowCount: number;
  viewCount: number;
  projectionRan: boolean;
};

const EMPTY: CalendarReadSpans = {
  totalMs: 0,
  projectionMs: 0,
  inventoryLoadMs: 0,
  inventoryNormalizeMs: 0,
  inventorySkipMs: 0,
  inventoryEligibilityMs: 0,
  curatorLoadMs: 0,
  curatorEligibilityMs: 0,
  existingWindowLoadMs: 0,
  eligibilityDedupeMs: 0,
  dismissedLookupMs: 0,
  upsertsMs: 0,
  calendarRowsReadMs: 0,
  syncMapMs: 0,
  selectionOverlayMs: 0,
  categoryEnrichMs: 0,
  displayDedupeMs: 0,
  snoozeFilterMs: 0,
  inventoryCandidateCount: 0,
  curatorCandidateCount: 0,
  upsertCount: 0,
  calendarRowCount: 0,
  viewCount: 0,
  projectionRan: false,
};

let current: CalendarReadSpans = { ...EMPTY };
let last: CalendarReadSpans | null = null;

export function beginCalendarReadProfile(): void {
  current = { ...EMPTY };
}

export function calendarReadSpan(): CalendarReadSpans {
  return current;
}

export function finishCalendarReadProfile(totalMs: number): CalendarReadSpans {
  current.totalMs = totalMs;
  last = { ...current };
  return last;
}

export function getLastCalendarReadProfile(): CalendarReadSpans | null {
  return last;
}

export function resetCalendarReadProfileForTests(): void {
  current = { ...EMPTY };
  last = null;
}

export function nowMs(): number {
  return performance.now();
}
