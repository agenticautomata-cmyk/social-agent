import type { ProgramLibraryPayload } from './types.js';
import { summarizeVerificationState } from './metadata.js';

/** Drop single-claim conflict rows and recompute verification display state. */
export function normalizeProgramLibraryVerificationState(payload: ProgramLibraryPayload): {
  payload: ProgramLibraryPayload;
  changed: boolean;
} {
  const next = { ...payload };
  let changed = false;
  const pruned = next.conflictingClaims.filter((c) => c.claims.length >= 2);
  if (pruned.length !== next.conflictingClaims.length) {
    next.conflictingClaims = pruned;
    changed = true;
  }
  const nextState = summarizeVerificationState(next);
  if (nextState !== next.verificationDisplayState) {
    next.verificationDisplayState = nextState;
    changed = true;
  }
  return { payload: next, changed };
}
