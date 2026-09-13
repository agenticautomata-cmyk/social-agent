/**
 * Blocked-source retry policy — do not permanently abandon challenged sources.
 * Honors Retry-After; exponential backoff for CAPTCHA/access-control;
 * low-frequency reassessment for persistent unsupported; operator pause wins.
 */

import type {
  AdaptiveExtractionStatus,
  BlockedSourceRetryState,
  RetryClass,
} from './types.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function clampFailures(n: number): number {
  return Math.max(0, Math.min(50, Math.floor(n)));
}

export function classifyRetry(input: {
  status: AdaptiveExtractionStatus;
  challengeProvider?: string | null;
  retryAfterSeconds?: number | null;
  operatorPaused?: boolean;
  httpStatus?: number | null;
}): RetryClass {
  if (input.operatorPaused || input.status === 'operator_paused') return 'operator_paused';
  if (input.status === 'rate_limited' || input.httpStatus === 429) return 'rate_limit';
  if (
    input.status === 'blocked' ||
    input.challengeProvider ||
    input.httpStatus === 403 ||
    input.httpStatus === 401
  ) {
    return 'captcha_access_control';
  }
  if (input.status === 'failed' && (input.httpStatus == null || input.httpStatus >= 500)) {
    return 'temp_server';
  }
  if (
    input.status === 'needs_adapter' ||
    input.status === 'structure_changed' ||
    input.status === 'partial'
  ) {
    return 'unsupported_reassess';
  }
  return 'none';
}

export function computeNextRetryAt(input: {
  retryClass: RetryClass;
  consecutiveFailures: number;
  now?: Date;
  retryAfterSeconds?: number | null;
}): string | null {
  const now = input.now ?? new Date();
  const failures = clampFailures(input.consecutiveFailures);
  switch (input.retryClass) {
    case 'operator_paused':
      return null;
    case 'none':
      return null;
    case 'rate_limit': {
      const sec = input.retryAfterSeconds != null && input.retryAfterSeconds > 0
        ? input.retryAfterSeconds
        : Math.min(3600, 30 * 2 ** Math.min(failures, 6));
      return new Date(now.getTime() + sec * 1000).toISOString();
    }
    case 'temp_server': {
      const ms = Math.min(6 * HOUR, 15 * 60_000 * 2 ** Math.min(failures, 5));
      return new Date(now.getTime() + ms).toISOString();
    }
    case 'captcha_access_control': {
      // Infrequent exponential backoff: 6h → 12h → 24h → 48h → 96h (cap 7d)
      const hours = Math.min(7 * 24, 6 * 2 ** Math.min(failures, 4));
      return new Date(now.getTime() + hours * HOUR).toISOString();
    }
    case 'unsupported_reassess': {
      const ms = Math.min(14 * DAY, 3 * DAY * 2 ** Math.min(failures, 3));
      return new Date(now.getTime() + ms).toISOString();
    }
    default:
      return null;
  }
}

export function buildRetryState(input: {
  status: AdaptiveExtractionStatus;
  prior?: BlockedSourceRetryState | null;
  challengeProvider?: string | null;
  retryAfterSeconds?: number | null;
  operatorPaused?: boolean;
  httpStatus?: number | null;
  lastStrategy?: string | null;
  lastHealthyAt?: string | null;
  now?: Date;
}): BlockedSourceRetryState {
  const retryClass = classifyRetry(input);
  const priorFailures = input.prior?.consecutiveFailures ?? 0;
  const successStatuses: AdaptiveExtractionStatus[] = [
    'healthy',
    'no_change',
    'empty_confirmed',
  ];
  const consecutiveFailures = successStatuses.includes(input.status)
    ? 0
    : priorFailures + 1;

  const nextRetryAt =
    retryClass === 'none'
      ? null
      : computeNextRetryAt({
          retryClass,
          consecutiveFailures,
          now: input.now,
          retryAfterSeconds: input.retryAfterSeconds,
        });

  return {
    retryClass,
    nextRetryAt,
    consecutiveFailures,
    lastHealthyAt:
      successStatuses.includes(input.status)
        ? (input.now ?? new Date()).toISOString()
        : input.lastHealthyAt ?? input.prior?.lastHealthyAt ?? null,
    lastStrategy: input.lastStrategy ?? input.prior?.lastStrategy ?? null,
    blocker:
      input.challengeProvider ??
      (input.status === 'blocked' ? 'access_control' : null) ??
      input.prior?.blocker ??
      null,
    operatorPaused: Boolean(input.operatorPaused) || retryClass === 'operator_paused',
    systemBackoff: retryClass !== 'none' && retryClass !== 'operator_paused',
  };
}

export function readRetryState(
  config: Record<string, unknown> | null | undefined,
): BlockedSourceRetryState | null {
  const raw = config?.adaptiveRetryState;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<BlockedSourceRetryState>;
  if (!r.retryClass) return null;
  return {
    retryClass: r.retryClass,
    nextRetryAt: r.nextRetryAt ?? null,
    consecutiveFailures: Number(r.consecutiveFailures ?? 0),
    lastHealthyAt: r.lastHealthyAt ?? null,
    lastStrategy: r.lastStrategy ?? null,
    blocker: r.blocker ?? null,
    operatorPaused: Boolean(r.operatorPaused),
    systemBackoff: Boolean(r.systemBackoff),
  };
}

export function shouldSkipCheckForBackoff(input: {
  retry: BlockedSourceRetryState | null;
  now?: Date;
  force?: boolean;
}): boolean {
  if (input.force) return false;
  if (!input.retry) return false;
  if (input.retry.operatorPaused) return true;
  if (!input.retry.nextRetryAt) return false;
  const now = input.now ?? new Date();
  return Date.parse(input.retry.nextRetryAt) > now.getTime();
}
