import { isMissingBrowserError } from '../playwright-runtime/index.js';

export type WatchlistDisplayHealth =
  | 'ready'
  | 'checking'
  | 'healthy'
  | 'degraded'
  | 'blocked'
  | 'failed'
  | 'unsupported';

const BROWSER_RETRY_MS = 15 * 60 * 1000;

export function nextScheduledCheckAt(input: {
  enabled: boolean;
  paused: boolean;
  checkFrequencyMs: number;
  lastSuccessfulCheck: Date | null;
  lastAttemptedCheck: Date | null;
  lastFailureAt?: Date | null;
  lastFailureMessage?: string | null;
  createdAt?: Date | null;
  now?: Date;
}): Date | null {
  if (!input.enabled || input.paused) return null;
  const now = input.now ?? new Date();
  const freq = Math.max(input.checkFrequencyMs, 60_000);
  const browserFail = isMissingBrowserError(input.lastFailureMessage);
  const attempt = input.lastAttemptedCheck ?? input.lastSuccessfulCheck;
  if (!attempt && !input.lastSuccessfulCheck) {
    return now;
  }
  if (browserFail && input.lastAttemptedCheck) {
    return new Date(input.lastAttemptedCheck.getTime() + BROWSER_RETRY_MS);
  }
  const anchor = input.lastSuccessfulCheck ?? input.lastAttemptedCheck ?? input.createdAt ?? now;
  return new Date(anchor.getTime() + freq);
}

export function isWatcherDue(input: {
  lastSuccessfulCheck: Date | null;
  lastAttemptedCheck: Date | null;
  checkFrequencyMs: number;
  lastFailureAt: Date | null;
  lastFailureMessage?: string | null;
  authenticationRequired: boolean;
  now?: Date;
}): boolean {
  const now = (input.now ?? new Date()).getTime();
  if (input.authenticationRequired) {
    const lastFail = input.lastFailureAt?.getTime() ?? 0;
    const backoff = Math.min(24 * 60 * 60 * 1000, 4 * 60 * 60 * 1000);
    if (lastFail && now - lastFail < backoff) return false;
  }
  const next = nextScheduledCheckAt({
    enabled: true,
    paused: false,
    checkFrequencyMs: input.checkFrequencyMs,
    lastSuccessfulCheck: input.lastSuccessfulCheck,
    lastAttemptedCheck: input.lastAttemptedCheck,
    lastFailureAt: input.lastFailureAt,
    lastFailureMessage: input.lastFailureMessage,
    now: input.now,
  });
  return !next || next.getTime() <= now;
}

export function watchlistDisplayHealth(input: {
  enabled: boolean;
  paused: boolean;
  healthStatus: string;
  sessionStatus: string | null;
  authenticationRequired: boolean;
  lastSuccessfulCheck: Date | null;
  lastAttemptedCheck: Date | null;
  lastFailureAt: Date | null;
  lastFailureMessage?: string | null;
  platform?: string | null;
  checkInProgress?: boolean;
}): WatchlistDisplayHealth {
  if (input.checkInProgress) return 'checking';
  if (
    input.authenticationRequired ||
    input.sessionStatus === 'login_required' ||
    input.healthStatus === 'login_required'
  ) {
    return 'blocked';
  }
  if (input.healthStatus === 'disabled' || !input.enabled) return 'unsupported';
  const failAfterSuccess =
    Boolean(input.lastFailureAt) &&
    (!input.lastSuccessfulCheck || input.lastFailureAt! > input.lastSuccessfulCheck);
  if (input.healthStatus === 'failed' || failAfterSuccess) {
    if (isMissingBrowserError(input.lastFailureMessage)) return 'degraded';
    return 'failed';
  }
  if (input.lastSuccessfulCheck) {
    if (input.paused) return 'ready';
    return 'healthy';
  }
  if (input.paused) return 'ready';
  return 'ready';
}
