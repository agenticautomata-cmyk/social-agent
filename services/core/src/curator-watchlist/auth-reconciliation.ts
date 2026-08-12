/**
 * Reconcile Instagram auth flags on source_watchers after session-backed runs.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';

const AUTH_ERROR_RE =
  /login_required|captcha|challenge|authentication required|login required|consent_required|security check/i;

/** True when a failure message indicates Instagram auth/challenge, not extraction noise. */
export function isInstagramAuthError(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  return AUTH_ERROR_RE.test(message);
}

/** True when a pipeline/session outcome should mark auth required. */
export function shouldMarkInstagramAuthenticationRequired(input: {
  pausedForAuth?: boolean;
  sessionStatus?: string | null;
  pageKind?: string | null;
}): boolean {
  if (input.pausedForAuth) return true;
  const status = input.sessionStatus ?? '';
  if (status === 'login_required' || status === 'captcha_blocked') return true;
  const kind = input.pageKind ?? '';
  return kind === 'login' || kind === 'challenge';
}

export function sessionStatusForAuthFailure(reason: string): string {
  if (/captcha|challenge|checkpoint|security check/i.test(reason)) return 'login_required';
  return 'login_required';
}

/** Clear stale auth-required state after a successful authenticated run. */
export async function reconcileAuthenticatedInstagramSuccess(watcherId: string): Promise<void> {
  const [watcher] = await db
    .select({
      authenticationRequired: sourceWatchers.authenticationRequired,
      lastFailureMessage: sourceWatchers.lastFailureMessage,
    })
    .from(sourceWatchers)
    .where(eq(sourceWatchers.id, watcherId))
    .limit(1);

  const clearFailureMessage =
    watcher?.authenticationRequired === true ||
    isInstagramAuthError(watcher?.lastFailureMessage);

  await db
    .update(sourceWatchers)
    .set({
      authenticationRequired: false,
      sessionStatus: 'ready',
      ...(clearFailureMessage ? { lastFailureMessage: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(sourceWatchers.id, watcherId));
}

/** Mark auth required after login/challenge — does not clear unrelated extraction errors elsewhere. */
export async function markInstagramAuthenticationRequired(
  watcherId: string,
  reason: string,
): Promise<void> {
  const msg = reason.slice(0, 200);
  await db
    .update(sourceWatchers)
    .set({
      authenticationRequired: true,
      sessionStatus: sessionStatusForAuthFailure(msg),
      lastFailureAt: new Date(),
      lastFailureMessage: msg,
      updatedAt: new Date(),
    })
    .where(eq(sourceWatchers.id, watcherId));
}
