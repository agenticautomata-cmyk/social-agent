/**
 * Batch 3 — suppress stale "next/current/upcoming" claims in operator prose.
 * Historical facts may remain; currentness language must match evaluateTemporalState.
 */

import {
  DEFAULT_TEMPORAL_TIMEZONE,
  evaluateTemporalState,
  type TemporalState,
} from './temporal-state.js';

const MONTH_DAY_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:[-–—]|and)\s*(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?\b/i;
const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** Latest explicit calendar date mentioned in text (UTC end-of-day for comparison). */
export function parseLatestExplicitDateInText(text: string, now = new Date()): Date | null {
  let latest: Date | null = null;

  const monthRe = new RegExp(MONTH_DAY_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = monthRe.exec(text)) != null) {
    const month = MONTHS.indexOf(match[1]!.toLowerCase());
    const day = Number(match[3] ?? match[2]);
    const year = match[4] ? Number(match[4]) : now.getFullYear();
    if (month < 0 || day < 1 || day > 31) continue;
    const candidate = new Date(Date.UTC(year, month, day, 23, 59, 59));
    if (!latest || candidate.getTime() > latest.getTime()) latest = candidate;
  }

  const numRe = new RegExp(NUMERIC_DATE_RE.source, 'g');
  while ((match = numRe.exec(text)) != null) {
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    const year = match[3]
      ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
      : now.getFullYear();
    if (month < 0 || month > 11 || day < 1 || day > 31) continue;
    const candidate = new Date(Date.UTC(year, month, day, 23, 59, 59));
    if (!latest || candidate.getTime() > latest.getTime()) latest = candidate;
  }

  return latest;
}

const CURRENTNESS_CLAIM_RE =
  /\b(next|upcoming|current|happening\s+now|scheduled\s+for|starts?\s+(?:today|tomorrow)|is\s+(?:this|coming)\s+(?:weekend|week))\b/i;

const NEXT_EVENT_SENTENCE_RE =
  /(?:^|[.!?]\s+)([^.!?]*(?:\b(?:the\s+)?next\s+event\b|\bupcoming\s+event\b|\bcurrent\s+(?:event|sale|promotion)\b|\bscheduled\s+for\b)[^.!?]*[.!?]?)/gi;

const HISTORICAL_WATCH_LINE =
  'This business has run local promotions recently — worth watching for the next one.';

export type OperatorProseSanitizeInput = {
  text: string | null | undefined;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  timezone?: string | null;
  now?: Date;
};

export type OperatorProseSanitizeResult = {
  text: string;
  changed: boolean;
  temporalState: TemporalState;
  suppressedClaims: number;
};

function isPastExplicitDateInText(text: string, now: Date): boolean {
  const parsed = parseLatestExplicitDateInText(text, now);
  if (!parsed) return false;
  return parsed.getTime() < now.getTime();
}

/**
 * True when prose asserts a next/current/upcoming occurrence that is already past
 * (either via structured dates or explicit dates inside the claim).
 */
export function hasStaleCurrentnessClaim(
  text: string | null | undefined,
  opts?: {
    startsAt?: Date | string | null;
    endsAt?: Date | string | null;
    timezone?: string | null;
    now?: Date;
  },
): boolean {
  const raw = (text ?? '').trim();
  if (!raw || !CURRENTNESS_CLAIM_RE.test(raw)) return false;

  const now = opts?.now ?? new Date();
  const temporal = evaluateTemporalState({
    startsAt: opts?.startsAt,
    endsAt: opts?.endsAt,
    timezone: opts?.timezone,
    now,
  });
  if (temporal.state === 'expired') return true;

  // No structured dates (or unknown): still catch "next event … August 8–9" after end.
  if (temporal.state === 'unknown' && isPastExplicitDateInText(raw, now)) {
    return true;
  }
  return false;
}

/**
 * Rewrite operator-facing summary/script so expired occurrences are not called next/current.
 * Does not delete historical evidence; replaces stale currentness sentences with watch language.
 */
export function sanitizeStaleTemporalProse(
  input: OperatorProseSanitizeInput,
): OperatorProseSanitizeResult {
  const now = input.now ?? new Date();
  const original = input.text ?? '';
  const temporal = evaluateTemporalState({
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone ?? DEFAULT_TEMPORAL_TIMEZONE,
    now,
  });

  if (!original.trim()) {
    return { text: original, changed: false, temporalState: temporal.state, suppressedClaims: 0 };
  }

  const staleByDates = temporal.state === 'expired';
  const staleByProse =
    temporal.state === 'unknown' &&
    CURRENTNESS_CLAIM_RE.test(original) &&
    isPastExplicitDateInText(original, now);

  if (!staleByDates && !staleByProse) {
    return { text: original, changed: false, temporalState: temporal.state, suppressedClaims: 0 };
  }

  let suppressed = 0;
  let next = original.replace(NEXT_EVENT_SENTENCE_RE, (sentence) => {
    if (!CURRENTNESS_CLAIM_RE.test(sentence)) return sentence;
    // Only suppress when the sentence itself references a past date, or dates are expired.
    if (staleByDates || isPastExplicitDateInText(sentence, now)) {
      suppressed += 1;
      return '';
    }
    return sentence;
  });

  // Broader cleanup for remaining "next event is …" fragments without sentence boundaries.
  next = next
    .replace(
      /\b(?:the\s+)?next\s+event\s+is\s+scheduled\s+for[^.!?\n]*/gi,
      () => {
        suppressed += 1;
        return '';
      },
    )
    .replace(/\b(?:upcoming|current)\s+(?:event|sale|promotion)\b[^.!?\n]*/gi, (m) => {
      if (staleByDates || isPastExplicitDateInText(m, now)) {
        suppressed += 1;
        return '';
      }
      return m;
    });

  next = next.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

  if (suppressed > 0) {
    if (!/\b(worth watching|previous|historical|has run)\b/i.test(next)) {
      next = next ? `${next}\n\n${HISTORICAL_WATCH_LINE}` : HISTORICAL_WATCH_LINE;
    }
  }

  return {
    text: next,
    changed: next !== original,
    temporalState: staleByDates || staleByProse ? 'expired' : temporal.state,
    suppressedClaims: suppressed,
  };
}

/** Soft temporal currency for Home / operator surfaces (structured dates + stale prose). */
export function isOperatorTemporallyCurrent(input: {
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  timezone?: string | null;
  summaryText?: string | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const temporal = evaluateTemporalState({
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
    now,
  });
  if (temporal.state === 'expired') return false;
  if (
    hasStaleCurrentnessClaim(input.summaryText, {
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
      now,
    })
  ) {
    return false;
  }
  return true;
}
