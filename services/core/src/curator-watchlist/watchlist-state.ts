import { isMissingBrowserError } from '../playwright-runtime/index.js';

/**
 * Operator-facing Watchlist health.
 *
 * Technical reachability alone must never produce "healthy". Healthy requires a recent
 * completed check that produced valid usable records.
 */
export type WatchlistDisplayHealth =
  | 'ready'
  | 'checking'
  | 'healthy'
  | 'no_change'
  | 'no_yield'
  | 'needs_setup'
  | 'blocked'
  | 'degraded'
  | 'failed'
  | 'paused'
  | 'unsupported';

export type WatchlistReachability = 'reachable' | 'redirected' | 'blocked' | 'failed' | 'unknown';

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
  /** When true, do not auto-schedule (needs_setup / blocked pause). */
  suppressSchedule?: boolean;
}): Date | null {
  if (!input.enabled || input.paused || input.suppressSchedule) return null;
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
  paused?: boolean;
  enabled?: boolean;
  suppressSchedule?: boolean;
}): boolean {
  if (input.paused || input.enabled === false || input.suppressSchedule) return false;
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

export function watchlistStatusExplanation(input: {
  displayHealth: WatchlistDisplayHealth;
  reachability?: WatchlistReachability | null;
  recordsExtracted?: number | null;
  newRecordsFound?: number | null;
  customExplanation?: string | null;
}): string {
  if (input.customExplanation?.trim()) return input.customExplanation.trim();
  switch (input.displayHealth) {
    case 'ready':
      return 'Configured but not checked yet.';
    case 'checking':
      return 'Check currently running.';
    case 'healthy': {
      const extracted = input.recordsExtracted ?? 0;
      const neu = input.newRecordsFound ?? 0;
      if (extracted > 0 && neu === extracted) {
        return `Baseline created from ${extracted} verified event listings.`;
      }
      if (extracted > 0) {
        return `Recent check extracted ${extracted} event${extracted === 1 ? '' : 's'}${
          neu > 0 ? `; ${neu} were new` : ''
        }.`;
      }
      return 'Recent check produced usable records.';
    }
    case 'no_change': {
      const extracted = input.recordsExtracted ?? 0;
      if (extracted > 0) {
        return `Checked ${extracted} current listings; no changes found.`;
      }
      return 'Valid check completed; no new records since the last extraction.';
    }
    case 'no_yield':
      return 'Page responded, but no usable events were found.';
    case 'needs_setup':
      return 'This source needs a location-specific Eventbrite URL.';
    case 'blocked':
      if (input.reachability === 'redirected') {
        return 'Eventbrite redirected this listing away from the configured URL.';
      }
      return 'Access is blocked (login, CAPTCHA, bot protection, or robots rules).';
    case 'degraded':
      return 'Some processing succeeded, but extraction or verification is incomplete.';
    case 'failed':
      return 'Technical execution error during the latest check.';
    case 'paused':
      return 'Operator paused checks for this source.';
    case 'unsupported':
      return 'This source is disabled.';
    default:
      return '';
  }
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
  needsSetup?: boolean;
  reachability?: WatchlistReachability | null;
  recordsExtracted?: number | null;
  verifiedYield?: number | null;
  newRecordsFound?: number | null;
  extractionCapabilityEstablished?: boolean;
  /** Last check completed without technical failure. */
  lastCheckCompletedOk?: boolean | null;
  lastSuccessfulExtractionAt?: Date | string | null;
  /**
   * When false, skip directory yield guards (Instagram / social account watches use
   * curator reliability stats instead of config.recordsExtracted).
   */
  applyYieldGuard?: boolean;
}): WatchlistDisplayHealth {
  if (input.checkInProgress) return 'checking';
  if (input.needsSetup || input.healthStatus === 'needs_setup') return 'needs_setup';
  if (
    input.authenticationRequired ||
    input.sessionStatus === 'login_required' ||
    input.healthStatus === 'login_required' ||
    input.healthStatus === 'blocked' ||
    input.reachability === 'blocked'
  ) {
    return 'blocked';
  }
  if (input.reachability === 'redirected' || input.healthStatus === 'redirected') {
    return 'blocked';
  }
  if (input.paused) return 'paused';
  if (input.healthStatus === 'disabled' || !input.enabled) return 'unsupported';

  const failAfterSuccess =
    Boolean(input.lastFailureAt) &&
    (!input.lastSuccessfulCheck || input.lastFailureAt! > input.lastSuccessfulCheck);
  if (input.healthStatus === 'failed' || failAfterSuccess) {
    if (isMissingBrowserError(input.lastFailureMessage)) return 'degraded';
    return 'failed';
  }

  if (input.healthStatus === 'degraded') return 'degraded';
  if (input.healthStatus === 'no_yield') return 'no_yield';
  if (input.healthStatus === 'no_change') return 'no_change';

  const applyYieldGuard = input.applyYieldGuard !== false;
  if (input.healthStatus === 'healthy') {
    if (!applyYieldGuard) return 'healthy';
    // Guard: never surface healthy when every yield metric is zero.
    const extracted = input.recordsExtracted ?? 0;
    const verified = input.verifiedYield ?? 0;
    if (extracted <= 0 && verified <= 0 && !input.extractionCapabilityEstablished) {
      if (input.lastAttemptedCheck || input.lastCheckCompletedOk) return 'no_yield';
      return 'ready';
    }
    if (
      input.extractionCapabilityEstablished &&
      (input.newRecordsFound ?? 0) === 0 &&
      extracted === 0 &&
      input.lastCheckCompletedOk
    ) {
      return 'no_change';
    }
    return 'healthy';
  }

  // Infer from yield when health_status still says pending/unknown after a completed check.
  if (applyYieldGuard && (input.lastCheckCompletedOk || input.lastSuccessfulCheck)) {
    const extracted = input.recordsExtracted ?? 0;
    const verified = input.verifiedYield ?? 0;
    if (extracted > 0 || verified > 0) return 'healthy';
    if (input.extractionCapabilityEstablished && (input.newRecordsFound ?? 0) === 0) {
      return 'no_change';
    }
    return 'no_yield';
  }

  if (input.lastSuccessfulCheck && !input.paused) return 'healthy';
  return 'ready';
}

export function isDirectoryWatchSource(input: {
  platform?: string | null;
  adapterType?: string | null;
  sourceCategory?: string | null;
  sourceUrl?: string | null;
  extractionMethod?: string | null;
}): boolean {
  if ((input.adapterType ?? '') === 'social_account') return false;
  if ((input.platform ?? '').toLowerCase() === 'instagram') return false;
  if (input.adapterType === 'eventbrite_directory') return true;
  if (input.adapterType === 'event_listing' || input.adapterType === 'wix_events') return true;
  if ((input.sourceCategory ?? '') === 'event_directory') return true;
  if ((input.extractionMethod ?? '') === 'eventbrite_directory') return true;
  if ((input.extractionMethod ?? '') === 'event_listing' || (input.extractionMethod ?? '') === 'wix_events') {
    return true;
  }
  if (/eventbrite\.com/i.test(input.sourceUrl ?? '')) return true;
  if (
    /(?:^|\/)(?:events?|live-music(?:-events)?|concerts?|shows?|calendar|upcoming|whats-?on)(?:\/|$)/i.test(
      (() => {
        try {
          return new URL(input.sourceUrl ?? '').pathname;
        } catch {
          return input.sourceUrl ?? '';
        }
      })(),
    )
  ) {
    return true;
  }
  return false;
}
