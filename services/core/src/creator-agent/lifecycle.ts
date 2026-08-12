import type { CreatorRelevanceInput, LifecycleStatus } from './types.js';
import { evaluateTemporalState } from './temporal-state.js';

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Authoritative lifecycle from dates + undated heuristics.
 * Dated events/promotions defer to evaluateTemporalState (Batch 3).
 * Retention/delete windows are NOT currentness.
 */
export function computeLifecycleStatus(
  input: CreatorRelevanceInput,
  now = new Date(),
): LifecycleStatus {
  const starts = toDate(input.eventStartsAt);
  const ends = toDate(input.eventEndsAt);
  const discovered = toDate(input.discoveredAt) ?? now;

  const meta = input.metadata ?? {};
  const timezone =
    typeof meta.timezone === 'string' && meta.timezone.trim()
      ? meta.timezone.trim()
      : typeof meta.timeZone === 'string' && meta.timeZone.trim()
        ? meta.timeZone.trim()
        : null;

  const temporal = evaluateTemporalState({
    startsAt: starts,
    endsAt: ends,
    timezone,
    now,
  });

  if (temporal.state === 'expired') return 'expired';

  if (temporal.state === 'upcoming') {
    const startMs = temporal.effectiveStart?.getTime() ?? starts?.getTime();
    if (startMs != null) {
      const daysUntil = (startMs - now.getTime()) / (24 * 60 * 60 * 1000);
      if (daysUntil <= 3) return 'expiring_soon';
    }
    return 'upcoming';
  }

  if (temporal.state === 'current') {
    const endMs = temporal.effectiveEnd?.getTime();
    if (endMs != null) {
      const hoursLeft = (endMs - now.getTime()) / 3_600_000;
      if (hoursLeft <= 48) return 'expiring_soon';
    }
    return 'active';
  }

  // unknown / no dates — undated heuristics (not false-expired)
  if (/\b(opening|grand opening|now open)\b/i.test(input.title)) {
    const ageDays = (now.getTime() - discovered.getTime()) / (24 * 60 * 60 * 1000);
    return ageDays > 21 ? 'archived' : ageDays > 14 ? 'expiring_soon' : 'active';
  }
  if (/\b(closing|liquidation|going out of business)\b/i.test(input.title)) {
    return 'needs_date_verification';
  }
  return 'active';
}

export function isLifecycleVisible(status: LifecycleStatus, includeArchived = false): boolean {
  if (includeArchived) return true;
  return status === 'upcoming' || status === 'active' || status === 'expiring_soon';
}

/** True when persisted or date-derived lifecycle is operator-current. */
export function isLifecycleCurrentForOperator(
  input: CreatorRelevanceInput & { lifecycleStatus?: LifecycleStatus | null },
  now = new Date(),
): boolean {
  const computed = computeLifecycleStatus(input, now);
  if (!isLifecycleVisible(computed)) return false;
  // If stored status already says expired/archived, trust demotion.
  if (input.lifecycleStatus === 'expired' || input.lifecycleStatus === 'archived') {
    return false;
  }
  return true;
}
