/**
 * Safe newsletter event-date normalization.
 * Never rolls an explicit past absolute date into a future year.
 */

export type DateNormalizationStatus =
  | 'resolved'
  | 'rejected_stale_date'
  | 'needs_verification';

export type DateNormalizationResult = {
  status: DateNormalizationStatus;
  isoDate: string | null;
  detail: string;
};

const MONTH_NAMES =
  'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
const MONTH_DAY = new RegExp(
  `\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
  'i',
);
const MONTH_DASH_RANGE = new RegExp(
  `\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*[-–—]\\s*(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`,
  'i',
);
const SAME_MONTH_DASH_RANGE = new RegExp(
  `\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*[-–—]\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
  'i',
);
const ON_WEEKDAY = /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const WEEKDAY_RELATIVE =
  /\b(?:this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b/i;

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysPast(iso: string, referenceMs: number): number {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return Number.NaN;
  return (referenceMs - parsed) / 86400000;
}

function parseExplicitIso(raw: string): { year: number; month: number; day: number } | null {
  const m = ISO_DATE.exec(raw.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function inferYearForMonthDay(
  month: number,
  day: number,
  anchor: Date,
  allowAnnualRecurrence: boolean,
): { year: number; detail: string } {
  const anchorYear = anchor.getUTCFullYear();
  let candidate = new Date(Date.UTC(anchorYear, month, day));
  const anchorStart = startOfDayUtc(anchor).getTime();
  if (candidate.getTime() < anchorStart - 86400000) {
    candidate = new Date(Date.UTC(anchorYear + 1, month, day));
  }
  if (allowAnnualRecurrence && candidate.getTime() < anchorStart - 86400000) {
    return { year: candidate.getUTCFullYear(), detail: 'annual_recurrence_current_occurrence' };
  }
  return { year: candidate.getUTCFullYear(), detail: 'nearest_future_from_anchor' };
}

function resolveRelativeWeekday(text: string, anchor: Date): DateNormalizationResult | null {
  const m = WEEKDAY_RELATIVE.exec(text);
  if (!m) return null;
  const target = m[1]!.toLowerCase();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const want = target === 'weekend' ? 6 : days.indexOf(target);
  if (want < 0) return null;

  const anchorDay = anchor.getUTCDay();
  let delta = want - anchorDay;
  if (/\bnext\b/i.test(m[0]!) || delta <= 0) {
    if (delta <= 0) delta += 7;
    if (/\bnext\b/i.test(m[0]!) && delta < 7) delta += 7;
  }
  const resolved = new Date(anchor.getTime() + delta * 86400000);
  return {
    status: 'resolved',
    isoDate: toIso(startOfDayUtc(resolved)),
    detail: 'relative_weekday_from_email_sent_date',
  };
}

const ISO_IN_TEXT = /\b(20\d{2}-\d{2}-\d{2})\b/g;

function futureIsoDatesInText(text: string, anchor: Date): string[] {
  const out: string[] = [];
  const anchorMs = anchor.getTime();
  for (const match of text.matchAll(ISO_IN_TEXT)) {
    const iso = match[1]!;
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed) && parsed >= anchorMs - 86400000) out.push(iso);
  }
  return [...new Set(out)];
}

export function normalizeExtractedEventDate(input: {
  rawDate?: string | null;
  emailSentAt?: Date | string | null;
  sourceText?: string | null;
  hasRecurrenceProof?: boolean;
  hasStrongCurrentEventEvidence?: boolean;
  referenceNow?: Date;
}): DateNormalizationResult {
  const raw = input.rawDate?.trim() ?? '';
  const anchor =
    input.emailSentAt != null
      ? new Date(input.emailSentAt)
      : input.referenceNow ?? new Date();
  const referenceMs = anchor.getTime();
  const blob = [raw, input.sourceText ?? ''].filter(Boolean).join('\n');

  const explicitIso = parseExplicitIso(raw);
  if (explicitIso) {
    const iso = raw;
    const past = daysPast(iso, referenceMs);
    if (!Number.isNaN(past) && past > 14) {
      const textIsos = futureIsoDatesInText(blob, anchor);
      if (textIsos.length === 1 && textIsos[0] !== iso) {
        return {
          status: 'resolved',
          isoDate: textIsos[0]!,
          detail: 'corrected_from_source_text_iso',
        };
      }
      if (input.hasStrongCurrentEventEvidence) {
        return {
          status: 'needs_verification',
          isoDate: iso,
          detail: 'explicit_stale_date_with_current_evidence',
        };
      }
      return {
        status: 'rejected_stale_date',
        isoDate: null,
        detail: `explicit_stale_date:${iso}`,
      };
    }
    return { status: 'resolved', isoDate: iso, detail: 'explicit_absolute_date' };
  }

  const relative = resolveRelativeWeekday(blob, anchor);
  if (relative && !raw) return relative;

  if (!raw) {
    const textIsos = futureIsoDatesInText(blob, anchor);
    if (textIsos.length === 1) {
      return {
        status: 'resolved',
        isoDate: textIsos[0]!,
        detail: 'iso_from_source_text',
      };
    }
    return { status: 'resolved', isoDate: null, detail: 'no_date' };
  }

  const slash = SLASH_DATE.exec(raw);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : null;
    if (year != null) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const past = daysPast(iso, referenceMs);
      if (past > 14) {
        if (input.hasStrongCurrentEventEvidence) {
          return { status: 'needs_verification', isoDate: iso, detail: 'explicit_stale_slash_date' };
        }
        return { status: 'rejected_stale_date', isoDate: null, detail: `explicit_stale_slash_date:${iso}` };
      }
      return { status: 'resolved', isoDate: iso, detail: 'slash_date_with_year' };
    }
    const { year: inferredYear } = inferYearForMonthDay(
      month,
      day,
      anchor,
      Boolean(input.hasRecurrenceProof),
    );
    const iso = `${inferredYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { status: 'resolved', isoDate: iso, detail: 'slash_date_inferred_year' };
  }

  const monthDay = MONTH_DAY.exec(raw);
  if (monthDay) {
    const monthNames = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    const monthToken = monthDay[1]!.slice(0, 3).toLowerCase();
    const month = monthNames.indexOf(monthToken);
    const day = Number(monthDay[2]);
    const explicitYear = monthDay[3] ? Number(monthDay[3]) : null;
    if (explicitYear != null) {
      const iso = `${explicitYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const past = daysPast(iso, referenceMs);
      if (past > 14) {
        if (input.hasRecurrenceProof && input.hasStrongCurrentEventEvidence) {
          const { year } = inferYearForMonthDay(month, day, anchor, true);
          return {
            status: 'resolved',
            isoDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            detail: 'annual_recurrence_with_proof',
          };
        }
        if (input.hasStrongCurrentEventEvidence) {
          return { status: 'needs_verification', isoDate: iso, detail: 'explicit_stale_month_day_year' };
        }
        return { status: 'rejected_stale_date', isoDate: null, detail: `explicit_stale_month_day:${iso}` };
      }
      return { status: 'resolved', isoDate: iso, detail: 'month_day_with_year' };
    }
    const { year, detail } = inferYearForMonthDay(
      month,
      day,
      anchor,
      Boolean(input.hasRecurrenceProof),
    );
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { status: 'resolved', isoDate: iso, detail };
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const iso = toIso(startOfDayUtc(new Date(parsed)));
    const past = daysPast(iso, referenceMs);
    if (past > 14) {
      if (input.hasStrongCurrentEventEvidence) {
        return { status: 'needs_verification', isoDate: iso, detail: 'parsed_stale_with_evidence' };
      }
      return { status: 'rejected_stale_date', isoDate: null, detail: `parsed_stale:${iso}` };
    }
    return { status: 'resolved', isoDate: iso, detail: 'parsed_absolute' };
  }

  return { status: 'resolved', isoDate: raw, detail: 'unparsed_passthrough' };
}

const MONTH_DAY_GLOBAL = new RegExp(
  `\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
  'gi',
);
const SLASH_WITH_YEAR_GLOBAL = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
const SLASH_WITH_WEEKDAY_GLOBAL =
  /\b(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\.?\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/gi;

function findTitleIndex(body: string, title: string): number {
  const needle = title.trim();
  if (!body || !needle) return -1;
  const lower = body.toLowerCase();
  const exact = lower.indexOf(needle.toLowerCase());
  if (exact >= 0) return exact;
  const tokens = needle
    .replace(/[™®]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(the|and|for|with|from|concert|by)$/i.test(word));
  for (let n = Math.min(tokens.length, 4); n >= 2; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const idx = lower.indexOf(tokens.slice(i, i + n).join(' ').toLowerCase());
      if (idx >= 0) return idx;
    }
  }
  return -1;
}

function resolveOnWeekday(text: string, anchor: Date): DateNormalizationResult | null {
  const match = ON_WEEKDAY.exec(text);
  if (!match) return null;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const want = days.indexOf(match[1]!.toLowerCase());
  if (want < 0) return null;
  let delta = want - anchor.getUTCDay();
  if (delta < 0) delta += 7;
  const resolved = new Date(anchor.getTime() + delta * 86400000);
  return {
    status: 'resolved',
    isoDate: toIso(startOfDayUtc(resolved)),
    detail: 'on_weekday_from_email_sent_date',
  };
}

function dashRangeFromText(
  text: string,
  emailSentAt?: Date | string | null,
): { startDate: string; endDate: string } | null {
  const sameMonth = SAME_MONTH_DASH_RANGE.exec(text);
  if (sameMonth) {
    const yearSuffix = sameMonth[4] ? ` ${sameMonth[4]}` : '';
    const start = normalizeExtractedEventDate({
      rawDate: `${sameMonth[1]} ${sameMonth[2]}${yearSuffix}`,
      emailSentAt,
    });
    const end = normalizeExtractedEventDate({
      rawDate: `${sameMonth[1]} ${sameMonth[3]}${yearSuffix}`,
      emailSentAt,
    });
    if (start.isoDate && end.isoDate) {
      return {
        startDate: preferCurrentOccurrenceYear(start.isoDate, emailSentAt),
        endDate: preferCurrentOccurrenceYear(end.isoDate, emailSentAt),
      };
    }
  }
  const match = MONTH_DASH_RANGE.exec(text);
  if (!match) return null;
  const start = normalizeExtractedEventDate({
    rawDate: `${match[1]} ${match[2]}${match[5] ? ` ${match[5]}` : ''}`,
    emailSentAt,
  });
  const end = normalizeExtractedEventDate({
    rawDate: `${match[3]} ${match[4]}${match[5] ? ` ${match[5]}` : ''}`,
    emailSentAt,
  });
  if (!start.isoDate || !end.isoDate) return null;
  return {
    startDate: preferCurrentOccurrenceYear(start.isoDate, emailSentAt),
    endDate: preferCurrentOccurrenceYear(end.isoDate, emailSentAt),
  };
}

export function sourceWindowAroundTitle(bodyText: string, title: string): string {
  const body = bodyText.replace(/\s+/g, ' ').trim();
  const idx = findTitleIndex(body, title);
  if (idx < 0) return '';
  const after = body.slice(idx, Math.min(body.length, idx + title.trim().length + 420));
  const before = body.slice(Math.max(0, idx - 80), idx);
  return `${before}\n${after}`.trim();
}

function preferCurrentOccurrenceYear(
  iso: string,
  emailSentAt?: Date | string | null,
): string {
  const anchor = emailSentAt != null ? new Date(emailSentAt) : new Date();
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const rolled = new Date(parsed);
  const sameMonthDayThisYear = new Date(
    Date.UTC(anchor.getUTCFullYear(), rolled.getUTCMonth(), rolled.getUTCDate()),
  );
  const daysFromAnchor =
    (sameMonthDayThisYear.getTime() - startOfDayUtc(anchor).getTime()) / 86400000;
  if (
    rolled.getUTCFullYear() === anchor.getUTCFullYear() + 1 &&
    daysFromAnchor >= -14 &&
    daysFromAnchor <= 0
  ) {
    return toIso(sameMonthDayThisYear);
  }
  return iso;
}

export function collectNormalizedDatesFromText(
  text: string,
  emailSentAt?: Date | string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const normalized = normalizeExtractedEventDate({ rawDate: raw, emailSentAt });
    if (normalized.status === 'resolved' && normalized.isoDate) {
      const iso = preferCurrentOccurrenceYear(normalized.isoDate, emailSentAt);
      if (!seen.has(iso)) {
        seen.add(iso);
        out.push(iso);
      }
    }
  };
  MONTH_DAY_GLOBAL.lastIndex = 0;
  SLASH_WITH_YEAR_GLOBAL.lastIndex = 0;
  SLASH_WITH_WEEKDAY_GLOBAL.lastIndex = 0;
  for (const match of text.matchAll(MONTH_DAY_GLOBAL)) add(match[0]!);
  for (const match of text.matchAll(SLASH_WITH_YEAR_GLOBAL)) add(match[0]!);
  for (const match of text.matchAll(SLASH_WITH_WEEKDAY_GLOBAL)) {
    add(`${match[1]}/${match[2]}${match[3] ? `/${match[3]}` : ''}`);
  }
  return out;
}

/**
 * Recover occurrence dates from the existing date-normalize parsers using
 * title-local newsletter text. Does not scan the whole email (avoids assigning
 * the first listed date to every item).
 */
export function recoverDatesNearTitle(input: {
  title: string;
  description?: string | null;
  bodyText: string;
  emailSentAt?: Date | string | null;
  rawStartDate?: string | null;
  rawEndDate?: string | null;
}): { startDate: string | null; endDate: string | null } {
  const body = input.bodyText.replace(/\s+/g, ' ').trim();
  const titleIdx = findTitleIndex(body, input.title);
  const afterTitle =
    titleIdx >= 0 ? body.slice(titleIdx, Math.min(body.length, titleIdx + input.title.trim().length + 420)) : '';
  const beforeTitle = titleIdx >= 0 ? body.slice(Math.max(0, titleIdx - 80), titleIdx) : '';
  const preferredWindow = [input.title, input.description ?? '', afterTitle]
    .filter((part) => part.trim())
    .join('\n');
  const fallbackWindow = [input.title, input.description ?? '', beforeTitle, afterTitle]
    .filter((part) => part.trim())
    .join('\n');

  const startFromRaw = normalizeExtractedEventDate({
    rawDate: input.rawStartDate,
    emailSentAt: input.emailSentAt,
    sourceText: preferredWindow,
  });
  const endFromRaw = normalizeExtractedEventDate({
    rawDate: input.rawEndDate,
    emailSentAt: input.emailSentAt,
    sourceText: preferredWindow,
  });
  if (startFromRaw.isoDate) {
    const startDate = preferCurrentOccurrenceYear(startFromRaw.isoDate, input.emailSentAt);
    const endDate = endFromRaw.isoDate
      ? preferCurrentOccurrenceYear(endFromRaw.isoDate, input.emailSentAt)
      : null;
    return {
      startDate,
      endDate: endDate && endDate !== startDate ? endDate : null,
    };
  }

  const dashRange = dashRangeFromText(preferredWindow, input.emailSentAt);
  if (dashRange) {
    return {
      startDate: dashRange.startDate,
      endDate: dashRange.endDate !== dashRange.startDate ? dashRange.endDate : null,
    };
  }

  const collected = collectNormalizedDatesFromText(preferredWindow, input.emailSentAt);
  const collectedOrFallback =
    collected.length > 0 ? collected : collectNormalizedDatesFromText(fallbackWindow, input.emailSentAt);
  const window = collected.length > 0 ? preferredWindow : fallbackWindow;
  if (collectedOrFallback.length === 0) {
    const weekday = resolveOnWeekday(preferredWindow, input.emailSentAt != null ? new Date(input.emailSentAt) : new Date());
    return { startDate: weekday?.isoDate ?? null, endDate: endFromRaw.isoDate };
  }
  SLASH_WITH_WEEKDAY_GLOBAL.lastIndex = 0;
  const slashCluster = (window.match(SLASH_WITH_WEEKDAY_GLOBAL) ?? []).length >= 2;
  const startDate = collectedOrFallback[0]!;
  const rangeEnd =
    collectedOrFallback.length > 1 &&
    (slashCluster ||
      /\b(?:through|thru|until|corrected dates)\b|[-–—]\s*(?:[a-z]{3,9}\s+)?\d{1,2}/i.test(window))
      ? collectedOrFallback[collectedOrFallback.length - 1]!
      : endFromRaw.isoDate;
  return {
    startDate,
    endDate: rangeEnd && rangeEnd !== startDate ? rangeEnd : null,
  };
}

/** @deprecated Use normalizeExtractedEventDate — kept for callers expecting string|null. */
export function normalizeExtractedEventDateLegacy(
  dateStr: string | null | undefined,
  emailSentAt?: Date | string | null,
): string | null {
  return normalizeExtractedEventDate({ rawDate: dateStr, emailSentAt }).isoDate;
}
