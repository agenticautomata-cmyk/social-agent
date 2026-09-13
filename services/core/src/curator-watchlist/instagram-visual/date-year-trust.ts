/**
 * Date / year trust for Instagram visual extraction.
 * Inference alone ≠ VERIFIED Calendar. Never roll old flyers forward.
 */

import {
  chicagoCalendarIso,
  nextWeekdayIso,
  reconcileStatedDateWithWeekday,
  utcWeekdayFromIsoDate,
  weekdayIndexFromToken,
} from '../watchlist-date-trust.js';
import type { YearTrustState } from './types.js';

export type YearTrustResult = {
  isoDate: string | null;
  yearTrust: YearTrustState;
  explanation: string;
  temporalClass: 'future' | 'expired' | 'undated' | 'review';
};

const MONTH_DAY_YEAR =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i;
const ISO_YMD = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/;
const SLASH_MDY = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/;
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function classifyTemporal(isoDate: string | null, now = new Date()): YearTrustResult['temporalClass'] {
  if (!isoDate) return 'undated';
  const today = chicagoCalendarIso(now);
  if (isoDate < today) return 'expired';
  if (isoDate === today) return 'future';
  return 'future';
}

/**
 * Resolve event date with explicit year trust states.
 * Never: roll old flyer to current year; use publish as event date;
 * assume annual repeat; convert expired→future; change year to force future.
 */
export function resolveEventDateWithYearTrust(input: {
  text: string;
  postPublishedAt?: string | null;
  now?: Date;
}): YearTrustResult {
  const now = input.now ?? new Date();
  const text = input.text;

  const isoMatch = text.match(ISO_YMD);
  if (isoMatch) {
    const date = iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (date) {
      return {
        isoDate: date,
        yearTrust: 'year_explicit',
        explanation: `Explicit ISO date ${date} in source text`,
        temporalClass: classifyTemporal(date, now),
      };
    }
  }

  const slash = text.match(SLASH_MDY);
  if (slash) {
    let y = Number(slash[3]);
    if (y < 100) y += 2000;
    const date = iso(y, Number(slash[1]), Number(slash[2]));
    if (date) {
      return {
        isoDate: date,
        yearTrust: 'year_explicit',
        explanation: `Explicit slash date ${date} in source text`,
        temporalClass: classifyTemporal(date, now),
      };
    }
  }

  const md = text.match(MONTH_DAY_YEAR);
  if (md) {
    const month = MONTHS[md[1]!.slice(0, 3).toLowerCase()]!;
    const day = Number(md[2]);
    if (md[3]) {
      const date = iso(Number(md[3]), month, day);
      if (date) {
        return {
          isoDate: date,
          yearTrust: 'year_explicit',
          explanation: `Explicit month/day/year ${date}`,
          temporalClass: classifyTemporal(date, now),
        };
      }
    }

    // Month/day without year — inference → review only under strict corroboration
    const published = input.postPublishedAt ? new Date(input.postPublishedAt) : null;
    if (!published || Number.isNaN(published.getTime())) {
      return {
        isoDate: null,
        yearTrust: 'year_unresolved',
        explanation: 'Month/day present but year missing and no publish timestamp for inference',
        temporalClass: 'review',
      };
    }

    const pubYear = published.getUTCFullYear();
    const candidates = [iso(pubYear, month, day), iso(pubYear + 1, month, day)].filter(
      Boolean,
    ) as string[];

    const weekdayTok = text.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i,
    )?.[1];
    const weekdayIdx = weekdayTok ? weekdayIndexFromToken(weekdayTok) : null;

    for (const candidate of candidates) {
      if (weekdayIdx != null && utcWeekdayFromIsoDate(candidate) !== weekdayIdx) continue;
      // Freshness: candidate must be within ~45 days of publish (not rolling ancient flyers)
      const pubIso = chicagoCalendarIso(published);
      const days =
        (Date.parse(`${candidate}T12:00:00Z`) - Date.parse(`${pubIso}T12:00:00Z`)) /
        (24 * 60 * 60 * 1000);
      if (days < -3 || days > 45) continue;
      // Inferred date must not precede the post (aside from tiny clock skew)
      if (days < -1) continue;

      const repaired = reconcileStatedDateWithWeekday({
        statedIso: candidate,
        text,
        publishedAt: input.postPublishedAt ?? null,
      });
      if (repaired.status === 'contradictory') continue;

      const temporal = classifyTemporal(candidate, now);
      // Never convert expired → future by bumping year
      if (temporal === 'expired' && candidate.startsWith(String(pubYear))) {
        return {
          isoDate: candidate,
          yearTrust: 'year_inferred_review',
          explanation: `Inferred year ${candidate} from publish+month/day+weekday; classified expired (not rolled forward)`,
          temporalClass: 'expired',
        };
      }

      // Publication + weekday agreement within horizon → year_corroborated (still not Calendar-verified)
      const weekdayAgreed = weekdayIdx != null;
      if (weekdayAgreed && temporal !== 'expired') {
        return {
          isoDate: candidate,
          yearTrust: 'year_corroborated',
          explanation: `Year corroborated to ${candidate}: publish ${pubIso}, flyer weekday+month/day agree, within ${Math.round(days)}d horizon — field evidence only, not Calendar admission`,
          temporalClass: 'future',
        };
      }

      return {
        isoDate: candidate,
        yearTrust: 'year_inferred_review',
        explanation: `Inferred ${candidate} from post publish ${pubIso}, month/day${weekdayAgreed ? ', weekday match' : ' (no weekday on flyer)'}, freshness window — review only, not Calendar-verified`,
        temporalClass: temporal === 'expired' ? 'expired' : 'review',
      };
    }

    // Insufficient corroboration — still surface as review candidate with month/day when possible
    const reviewDate = iso(pubYear, month, day);
    if (reviewDate) {
      const pubIso = chicagoCalendarIso(published);
      const days =
        (Date.parse(`${reviewDate}T12:00:00Z`) - Date.parse(`${pubIso}T12:00:00Z`)) /
        (24 * 60 * 60 * 1000);
      if (days >= -3 && days <= 90) {
        return {
          isoDate: reviewDate,
          yearTrust: 'year_inferred_review',
          explanation:
            'Month/day present; year inference lacks full weekday/horizon corroboration — visible review candidate only',
          temporalClass: classifyTemporal(reviewDate, now) === 'expired' ? 'expired' : 'review',
        };
      }
    }

    return {
      isoDate: null,
      yearTrust: 'year_unresolved',
      explanation: 'Month/day present but year inference failed corroboration (weekday/freshness)',
      temporalClass: 'review',
    };
  }

  // Weekday-only with publish context → review candidate, not verified
  const headingIdx = weekdayIndexFromToken(
    text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1] ?? '',
  );
  if (headingIdx != null && input.postPublishedAt) {
    const inferred = nextWeekdayIso(new Date(input.postPublishedAt), headingIdx);
    return {
      isoDate: inferred,
      yearTrust: 'year_inferred_review',
      explanation: `Weekday-only inference to ${inferred} from publish date — review only`,
      temporalClass: 'review',
    };
  }

  return {
    isoDate: null,
    yearTrust: 'year_unresolved',
    explanation: 'No usable date evidence',
    temporalClass: 'undated',
  };
}

/** Reject attempts to treat publish datetime as the event date. */
export function rejectPublishDateAsEventDate(
  eventIso: string | null,
  publishedAt: string | null,
): boolean {
  if (!eventIso || !publishedAt) return false;
  const pub = chicagoCalendarIso(new Date(publishedAt));
  // Same calendar day alone is allowed only with independent date text — caller checks.
  return eventIso === pub;
}
