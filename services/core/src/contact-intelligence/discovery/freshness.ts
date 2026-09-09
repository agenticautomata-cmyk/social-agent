/**
 * Freshness windows for official-contact discovery.
 *
 * Mission defaults:
 * - recheck before every important pitch
 * - routine recheck every 60–90 days
 * - immediately recheck older named-contact records
 * - quarantine conflicts rather than delete them
 *
 * The send-gate {@link EVIDENCE_RECHECK_DAYS} (120) remains a hard outer bound.
 * Discovery is stricter so research queues work before a pitch becomes blocked.
 */

import type { DiscoveryContactState } from './states.js';

/** Start of the routine recheck window. */
export const DISCOVERY_ROUTINE_RECHECK_MIN_DAYS = 60;

/** End of the routine recheck window — overdue after this. */
export const DISCOVERY_ROUTINE_RECHECK_MAX_DAYS = 90;

/**
 * For an important pitch, evidence must have been rechecked within this many days
 * or discovery requires a fresh verification pass before recommending outreach.
 */
export const DISCOVERY_IMPORTANT_PITCH_RECHECK_DAYS = 7;

export type DiscoveryFreshnessStatus =
  | 'fresh'
  | 'due_soon'
  | 'overdue'
  | 'immediate_named'
  | 'important_pitch_recheck'
  | 'unknown_age'
  | 'conflict_quarantine';

export type DiscoveryFreshnessVerdict = {
  status: DiscoveryFreshnessStatus;
  /** Age in whole days of the newest of lastRecheckedAt / evidenceCapturedAt. */
  ageDays: number | null;
  needsRecheck: boolean;
  /** Operator-safe explanation. */
  reason: string;
  /** Suggested next check ISO date (UTC noon), when computable. */
  nextRecheckAt: string | null;
};

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return (now.getTime() - then) / 86_400_000;
}

function addDaysIso(from: Date, days: number): string {
  const next = new Date(from.getTime() + days * 86_400_000);
  return next.toISOString();
}

/**
 * Evaluates whether discovery evidence is still current enough to recommend.
 */
export function evaluateDiscoveryFreshness(input: {
  evidenceCapturedAt?: string | null;
  lastRecheckedAt?: string | null;
  discoveryState: DiscoveryContactState;
  /** True when Kellie is about to prepare an important pitch. */
  importantPitch?: boolean;
  /** Active conflict note quarantines use until resolved. */
  conflictNote?: string | null;
  now?: Date;
}): DiscoveryFreshnessVerdict {
  const now = input.now ?? new Date();

  if (input.conflictNote?.trim()) {
    return {
      status: 'conflict_quarantine',
      ageDays: daysSince(input.lastRecheckedAt ?? input.evidenceCapturedAt ?? null, now),
      needsRecheck: true,
      reason:
        'Conflicting evidence is quarantined. Resolve the conflict before treating this contact as current.',
      nextRecheckAt: now.toISOString(),
    };
  }

  if (input.discoveryState === 'blocked_or_removed') {
    return {
      status: 'fresh',
      ageDays: null,
      needsRecheck: false,
      reason: 'Contact is blocked or removed — freshness does not apply.',
      nextRecheckAt: null,
    };
  }

  const age =
    daysSince(input.lastRecheckedAt ?? null, now) ??
    daysSince(input.evidenceCapturedAt ?? null, now);

  if (age === null) {
    return {
      status: 'unknown_age',
      ageDays: null,
      needsRecheck: true,
      reason: 'No capture or recheck timestamp — treat as unverified until rechecked.',
      nextRecheckAt: now.toISOString(),
    };
  }

  const named =
    input.discoveryState === 'verified_named_contact' ||
    input.discoveryState === 'stale_needs_recheck';

  if (input.importantPitch) {
    if (age > DISCOVERY_IMPORTANT_PITCH_RECHECK_DAYS) {
      return {
        status: 'important_pitch_recheck',
        ageDays: Math.floor(age),
        needsRecheck: true,
        reason: `Important pitch requires a recheck within ${DISCOVERY_IMPORTANT_PITCH_RECHECK_DAYS} days; evidence is ${Math.floor(age)} days old.`,
        nextRecheckAt: now.toISOString(),
      };
    }
  }

  if (named && age > DISCOVERY_ROUTINE_RECHECK_MIN_DAYS) {
    return {
      status: 'immediate_named',
      ageDays: Math.floor(age),
      needsRecheck: true,
      reason: `Named contacts older than ${DISCOVERY_ROUTINE_RECHECK_MIN_DAYS} days need an immediate recheck (age ${Math.floor(age)} days).`,
      nextRecheckAt: now.toISOString(),
    };
  }

  if (age > DISCOVERY_ROUTINE_RECHECK_MAX_DAYS) {
    return {
      status: 'overdue',
      ageDays: Math.floor(age),
      needsRecheck: true,
      reason: `Routine freshness window is ${DISCOVERY_ROUTINE_RECHECK_MIN_DAYS}–${DISCOVERY_ROUTINE_RECHECK_MAX_DAYS} days; evidence is ${Math.floor(age)} days old.`,
      nextRecheckAt: now.toISOString(),
    };
  }

  if (age > DISCOVERY_ROUTINE_RECHECK_MIN_DAYS) {
    return {
      status: 'due_soon',
      ageDays: Math.floor(age),
      needsRecheck: false,
      reason: `Inside the ${DISCOVERY_ROUTINE_RECHECK_MIN_DAYS}–${DISCOVERY_ROUTINE_RECHECK_MAX_DAYS} day routine window — schedule a recheck soon.`,
      nextRecheckAt: addDaysIso(
        now,
        Math.max(1, DISCOVERY_ROUTINE_RECHECK_MAX_DAYS - Math.floor(age)),
      ),
    };
  }

  return {
    status: 'fresh',
    ageDays: Math.floor(age),
    needsRecheck: false,
    reason: `Evidence is ${Math.floor(age)} days old — within the routine freshness window.`,
    nextRecheckAt: addDaysIso(now, DISCOVERY_ROUTINE_RECHECK_MIN_DAYS - Math.floor(age)),
  };
}

/**
 * Applies freshness overlay onto a discovery state without inventing verification.
 * Never upgrades inferred/unknown/blocked into a verified state.
 */
export function applyFreshnessToDiscoveryState(
  state: DiscoveryContactState,
  freshness: DiscoveryFreshnessVerdict,
): DiscoveryContactState {
  if (
    state === 'inferred_unverified' ||
    state === 'unknown' ||
    state === 'blocked_or_removed' ||
    state === 'conflicting'
  ) {
    return state;
  }
  if (freshness.status === 'conflict_quarantine') return 'conflicting';
  if (
    freshness.needsRecheck &&
    (freshness.status === 'overdue' ||
      freshness.status === 'immediate_named' ||
      freshness.status === 'important_pitch_recheck' ||
      freshness.status === 'unknown_age')
  ) {
    return 'stale_needs_recheck';
  }
  return state;
}
