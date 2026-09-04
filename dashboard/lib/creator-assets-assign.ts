/**
 * Assignment save UX helpers — keep client loading truthful across slow kit rebuilds.
 * Pure functions so regression tests do not need the browser or live kits.
 */

export type AssignPhase = 'idle' | 'saving' | 'generating' | 'ready' | 'failed';

export type AssignClientPolicy = {
  /** After this many ms without a response, leave "saving" and show generating + poll. */
  softTimeoutMs: number;
  /** Max time waiting (including soft phase) before reconcile-and-release. */
  hardTimeoutMs: number;
  pollIntervalMs: number;
};

export const DEFAULT_ASSIGN_CLIENT_POLICY: AssignClientPolicy = {
  softTimeoutMs: 8_000,
  hardTimeoutMs: 120_000,
  pollIntervalMs: 2_000,
};

export function assignStatusLabel(phase: AssignPhase): string {
  switch (phase) {
    case 'saving':
      return 'Saving assignment…';
    case 'generating':
      return 'Assignment saved — generating kit…';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return '';
  }
}

export function softTimeoutMessage(): string {
  return 'Assignment is still in progress on the server (not marked failed). Checking status…';
}

export function hardTimeoutMessage(): string {
  return 'Still waiting on the server — status will refresh from saved data. This does not mean generation stopped.';
}

/** Stale response guard: ignore results from an older save when a newer one started. */
export function shouldApplyAssignResult(
  responseSeq: number,
  activeSeq: number,
): boolean {
  return responseSeq === activeSeq;
}

export type AssignmentRowLike = {
  variant?: string | null;
  versionNumber?: number | null;
  versionId?: string | null;
  webUrl?: string | null;
  pdfUrl?: string | null;
  generationStatus?: string | null;
};

/** True when every desired variant is present and marked ready with matching version links. */
export function assignmentsSettledForTargets(
  assignments: AssignmentRowLike[],
  targets: string[],
): boolean {
  const desired = new Set(
    targets.filter((t) => t !== 'unassigned' && t !== 'all'),
  );
  if (targets.includes('all')) {
    desired.add('hotel');
    desired.add('restaurant');
    desired.add('destination');
  }
  if (desired.size === 0) {
    return assignments.length === 0;
  }
  const byVariant = new Map<string, AssignmentRowLike>();
  for (const row of assignments) {
    if (row.variant) byVariant.set(row.variant, row);
  }
  for (const variant of desired) {
    const row = byVariant.get(variant);
    if (!row) return false;
    if (row.generationStatus === 'generation_failed') return false;
    if (row.generationStatus === 'pending_build') return false;
    if (row.generationStatus && row.generationStatus !== 'ready') return false;
    if (row.versionNumber == null) return false;
    if (row.webUrl && row.versionNumber != null) {
      if (!row.webUrl.includes(`v=${row.versionNumber}`)) return false;
    }
    if (row.pdfUrl && row.versionNumber != null) {
      if (!row.pdfUrl.includes(`v=${row.versionNumber}`)) return false;
    }
  }
  // No unexpected leftover kits from a prior selection.
  for (const row of assignments) {
    if (row.variant && !desired.has(row.variant)) return false;
  }
  return true;
}

export function conflictingActionReason(phase: AssignPhase): string | null {
  if (phase === 'saving') return 'Wait — assignment is still saving.';
  if (phase === 'generating') {
    return 'Wait — kits are still generating. Other photos stay usable.';
  }
  return null;
}

export type LostResponseRecovery =
  | { kind: 'ready'; notice: string }
  | { kind: 'poll'; notice: string }
  | { kind: 'failed'; error: string };

/**
 * Decide client recovery after fetch throws / response is lost.
 * Never claims the server failed when assignment rows already exist.
 */
export function decideLostResponseRecovery(input: {
  assignments: AssignmentRowLike[];
  targets: string[];
  softFired: boolean;
  fetchErrorMessage: string;
}): LostResponseRecovery {
  const { assignments, targets, softFired, fetchErrorMessage } = input;
  if (assignmentsSettledForTargets(assignments, targets)) {
    return {
      kind: 'ready',
      notice: 'Assignment saved. Kit versions ready (recovered after a lost response).',
    };
  }
  if (assignments.length > 0) {
    return {
      kind: 'poll',
      notice: softFired
        ? 'Connection dropped while kits were generating. Assignment may already be saved — status refreshed from server.'
        : 'Could not read the save response. Refreshed from server — retry only if kits still look wrong.',
    };
  }
  return { kind: 'failed', error: fetchErrorMessage };
}

export type SoftTimeoutTransition = {
  nextPhase: 'generating';
  notice: string;
  startPoll: true;
};

/** Soft timeout: leave "saving", do not mark failed, begin poll. */
export function decideSoftTimeoutTransition(): SoftTimeoutTransition {
  return {
    nextPhase: 'generating',
    notice: softTimeoutMessage(),
    startPoll: true,
  };
}

export type HardTimeoutRecovery =
  | { kind: 'ready'; notice: string; closeDraft: true }
  | { kind: 'released'; notice: string; closeDraft: boolean };

/** Hard timeout: reconcile from saved server state; never invent a server failure. */
export function decideHardTimeoutRecovery(input: {
  assignments: AssignmentRowLike[] | null;
  targets: string[];
}): HardTimeoutRecovery {
  const { assignments, targets } = input;
  if (assignments && assignmentsSettledForTargets(assignments, targets)) {
    return {
      kind: 'ready',
      notice: 'Assignment saved. Kit versions ready.',
      closeDraft: true,
    };
  }
  const failed = (assignments ?? []).some((r) => r.generationStatus === 'generation_failed');
  return {
    kind: 'released',
    notice:
      'Timed out waiting for the response. Refreshed from saved server state — this does not mean the server failed. Retry only if a kit still shows generating/failed.',
    closeDraft: !failed,
  };
}
