/**
 * Source health states.
 *
 * The rule this module exists to enforce: a source is not healthy because a row exists
 * for it. `unchecked` is the starting state and only a successful check moves it.
 *
 * Equally important, several honest non-success states are NOT failures:
 *   - `dormant` — the page loaded and truthfully has nothing right now. KC Restaurant
 *     Week's participant list is empty between event years. Reporting that as broken
 *     sends an operator chasing a bug that does not exist.
 *   - `robots_refused` — the site owner asked crawlers not to read this path and Benson
 *     complied. That is correct behaviour, not an error.
 *   - `needs_browser` — the page renders client-side, so a plain fetch legitimately
 *     returns nothing. The HLAKC member directory does this.
 *
 * Pure module.
 */

export const SOURCE_HEALTH_STATES = [
  'unchecked',
  'healthy',
  'dormant',
  'structural_break',
  'robots_refused',
  'needs_browser',
  'unreachable',
  'disabled_not_applicable',
] as const;

export type SourceHealthState = (typeof SOURCE_HEALTH_STATES)[number];

/** States where the source is doing its job, whether or not it returned records. */
const WORKING_STATES = new Set<SourceHealthState>(['healthy', 'dormant']);

/** States that describe a deliberate, correct refusal rather than a fault. */
const HONEST_NON_FAILURE_STATES = new Set<SourceHealthState>([
  'dormant',
  'robots_refused',
  'needs_browser',
  'disabled_not_applicable',
]);

export function isSourceWorking(state: SourceHealthState): boolean {
  return WORKING_STATES.has(state);
}

/** True when this state should NOT be presented to an operator as something broken. */
export function isHonestNonFailure(state: SourceHealthState): boolean {
  return HONEST_NON_FAILURE_STATES.has(state);
}

export function isSourceHealthState(value: unknown): value is SourceHealthState {
  return typeof value === 'string' && (SOURCE_HEALTH_STATES as readonly string[]).includes(value);
}

const CHECK_INTERVAL_DAYS = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  seasonal_escalating: 30,
} as const;

export type CheckFrequency = keyof typeof CHECK_INTERVAL_DAYS;

/**
 * When to look again.
 *
 * `seasonal_escalating` exists for KC Restaurant Week: monthly most of the year, then
 * tightening as the January event approaches, because the participant list repopulates
 * shortly beforehand and that is the whole reason to watch it.
 */
export function nextCheckAt(input: {
  frequency: CheckFrequency;
  health: SourceHealthState;
  consecutiveFailures: number;
  from?: Date;
}): Date {
  const from = input.from ?? new Date();
  let days: number = CHECK_INTERVAL_DAYS[input.frequency];

  if (input.frequency === 'seasonal_escalating') {
    days = daysUntilRestaurantWeekWindow(from) <= 60 ? 1 : 30;
  }

  // Back off a genuinely broken source rather than hammering it, but never past a
  // month — an operator needs to find out a source is dead reasonably soon.
  if (input.health === 'unreachable' || input.health === 'structural_break') {
    days = Math.min(30, Math.max(1, 2 ** Math.min(input.consecutiveFailures, 5)));
  }
  // A refusal we intend to respect forever does not need re-checking often.
  if (input.health === 'robots_refused' || input.health === 'disabled_not_applicable') {
    days = 365;
  }

  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** KC Restaurant Week runs in January. Returns days until the pre-event ramp. */
function daysUntilRestaurantWeekWindow(from: Date): number {
  const year = from.getUTCFullYear();
  // The participant list matters from roughly mid-November through the January event.
  let target = new Date(Date.UTC(year, 0, 10));
  if (from.getTime() > target.getTime()) target = new Date(Date.UTC(year + 1, 0, 10));
  return Math.round((target.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Operator-safe explanation of a source's state. Deliberately written for someone who
 * did not build the scraper: it says what happened, whether it is a problem, and what
 * to do. Never a stack trace, never a selector, never a model's reasoning.
 */
export function explainHealth(input: {
  state: SourceHealthState;
  sourceName: string;
  recordCount?: number | null;
  detail?: string | null;
}): string {
  const name = input.sourceName;
  switch (input.state) {
    case 'unchecked':
      return `${name} has been registered but never successfully checked, so nothing from it can be trusted yet.`;
    case 'healthy':
      return `${name} was read successfully${
        input.recordCount != null ? ` and returned ${input.recordCount} records` : ''
      }.`;
    case 'dormant':
      return `${name} loaded correctly and genuinely has nothing right now. This is a normal state for this source, not a failure — nothing needs fixing.`;
    case 'structural_break':
      return `${name} loaded but its layout no longer matches what Benson knows how to read, so it is returning far less than it should. The page was probably redesigned, moved or renamed. Benson is not broken; the page it was watching changed. Someone needs to find the current link and update it.`;
    case 'robots_refused':
      return `${name} asks crawlers not to read this page in its robots.txt, and Benson respects that. This is deliberate and correct — it is not an error and does not need fixing.`;
    case 'needs_browser':
      return `${name} builds its content in the browser rather than sending it in the page, so a plain fetch legitimately returns nothing. It needs to be read with a real browser before its data can be used.`;
    case 'unreachable':
      return `${name} could not be reached${input.detail ? ` (${input.detail})` : ''}. This may be temporary; Benson will keep trying at a slowing interval.`;
    case 'disabled_not_applicable':
      return `${name} is deliberately switched off${input.detail ? `: ${input.detail}` : '.'}`;
    default:
      return `${name} is in an unrecognised state.`;
  }
}

/**
 * Decides the health state from what a check actually produced.
 *
 * `expectedMinimumRecords` is what makes `structural_break` distinguishable from
 * `dormant`: a Visit KC hotel-openings page that suddenly yields two properties instead
 * of a dozen has almost certainly been restructured, whereas a Restaurant Week
 * participant list yielding zero is simply between event years.
 */
export function classifyCheckOutcome(input: {
  fetched: boolean;
  httpStatus?: number | null;
  robotsDisallowed?: boolean;
  requiresBrowser?: boolean;
  recordCount: number;
  expectedMinimumRecords?: number | null;
  /** True when zero records is a documented normal state for this source. */
  emptyIsNormal?: boolean;
}): SourceHealthState {
  if (input.robotsDisallowed) return 'robots_refused';
  if (!input.fetched) return 'unreachable';
  if (input.httpStatus != null && input.httpStatus >= 400) {
    return input.httpStatus === 404 ? 'structural_break' : 'unreachable';
  }
  if (input.recordCount === 0) {
    if (input.requiresBrowser) return 'needs_browser';
    if (input.emptyIsNormal) return 'dormant';
    return 'structural_break';
  }
  const floor = input.expectedMinimumRecords ?? 0;
  if (floor > 0 && input.recordCount < floor) return 'structural_break';
  return 'healthy';
}
