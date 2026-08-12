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
const MONTH_DAY = new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b`, 'i');
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

/** @deprecated Use normalizeExtractedEventDate — kept for callers expecting string|null. */
export function normalizeExtractedEventDateLegacy(
  dateStr: string | null | undefined,
  emailSentAt?: Date | string | null,
): string | null {
  return normalizeExtractedEventDate({ rawDate: dateStr, emailSentAt }).isoDate;
}
