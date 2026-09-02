/** Deterministic date/weekday trust for Watchlist. Never invent a publication date. */

export type DateTrustStatus = 'resolved' | 'uncertain' | 'contradictory';

export type DateTrustResult = {
  isoDate: string | null;
  endIsoDate: string | null;
  weekday: string | null;
  status: DateTrustStatus;
  reason: string | null;
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const MONTH_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i;
const ISO_RE = /\b(20\d{2})-(\d{2})-(\d{2})\b/;
const SLASH_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function pad(n: number | string): string {
  return String(n).padStart(2, '0');
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function utcWeekdayFromIsoDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0)).getUTCDay();
}

export function weekdayNameFromIsoDate(iso: string): string {
  return WEEKDAYS[utcWeekdayFromIsoDate(iso)] ?? '';
}

export function weekdayIndexFromToken(token: string): number | null {
  const t = token.toLowerCase();
  if (t.startsWith('sun')) return 0;
  if (t.startsWith('mon')) return 1;
  if (t.startsWith('tue')) return 2;
  if (t.startsWith('wed')) return 3;
  if (t.startsWith('thu')) return 4;
  if (t.startsWith('fri')) return 5;
  if (t.startsWith('sat')) return 6;
  return null;
}

export function explicitWeekdayFromText(text: string): { name: string; index: number } | null {
  const heading = text.match(
    /(?:^|\n)\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*(?:—|-|:)/i,
  );
  const dated = text.match(
    /\b(?:this|next|coming)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i,
  );
  const night = text.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+night\b/i,
  );
  const token = heading?.[1] ?? dated?.[1] ?? night?.[1];
  if (!token) return null;
  const index = weekdayIndexFromToken(token);
  if (index == null) return null;
  return { name: WEEKDAYS[index]!, index };
}

export function chicagoWeekdayIndex(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
  })
    .format(at)
    .toLowerCase();
  return WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]);
}

export function addUtcDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days, 12, 0, 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function chicagoCalendarIso(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/** Next occurrence of target weekday from a timestamp, including today. */
export function nextWeekdayIso(from: Date, targetIndex: number): string {
  const start = chicagoCalendarIso(from);
  const startDow = utcWeekdayFromIsoDate(start);
  const diff = (targetIndex - startDow + 7) % 7;
  return addUtcDays(start, diff);
}

export function dateAgreesWithExplicitWeekday(text: string, isoDate: string): boolean {
  const weekday = explicitWeekdayFromText(text);
  if (!weekday) return true;
  return utcWeekdayFromIsoDate(isoDate) === weekday.index;
}

function parseSlashDate(text: string): { iso: string; yearStated: boolean } | null {
  const m = text.match(SLASH_RE);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const iso = isoFromParts(year, month, day);
  return iso ? { iso, yearStated: true } : null;
}

function parseMonthDay(text: string): { month: number; day: number; year: number | null } | null {
  const m = text.match(MONTH_RE);
  if (!m) return null;
  const month = Number(MONTHS[m[1]!.slice(0, 3).toLowerCase()]);
  const day = Number(m[2]);
  const year = m[3] ? Number(m[3]) : null;
  if (!month) return null;
  return { month, day, year };
}

function untilIso(text: string, now: Date): string | null {
  const labor = /until\s+labor day(?:\s+sept(?:ember)?\s+(\d{1,2}))?/i.exec(text);
  if (labor) {
    const day = labor[1] ? Number(labor[1]) : 7;
    return isoFromParts(now.getUTCFullYear(), 9, day);
  }
  const until = /until\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})/i.exec(
    text,
  );
  if (until) {
    const month = Number(MONTHS[until[1]!.slice(0, 3).toLowerCase()]);
    return isoFromParts(now.getUTCFullYear(), month, Number(until[2]));
  }
  return null;
}

/**
 * Resolve a date from caption text without fabricating a publication time.
 * Year is used only when stated, or when a weekday uniquely selects this/next year.
 */
export function resolveWatchlistDate(input: {
  text: string;
  publishedAt?: string | null;
  now?: Date;
  statedIso?: string | null;
}): DateTrustResult {
  const now = input.now ?? new Date();
  const text = input.text;
  const weekday = explicitWeekdayFromText(text);
  const endIsoDate = untilIso(text, now);

  const isoMatch = text.match(ISO_RE);
  const stated = input.statedIso && /^\d{4}-\d{2}-\d{2}$/.test(input.statedIso) ? input.statedIso : isoMatch ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` : null;
  const slash = parseSlashDate(text);
  const md = parseMonthDay(text);
  const anchor = input.publishedAt ? new Date(input.publishedAt) : now;

  const check = (iso: string, yearStated: boolean): DateTrustResult => {
    if (weekday && utcWeekdayFromIsoDate(iso) !== weekday.index) {
      if (!yearStated) {
        const altYear = Number(iso.slice(0, 4)) + 1;
        const alt = isoFromParts(altYear, Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
        if (alt && utcWeekdayFromIsoDate(alt) === weekday.index) {
          return { isoDate: alt, endIsoDate, weekday: weekday.name, status: 'resolved', reason: 'year_selected_to_match_weekday' };
        }
      }
      return {
        isoDate: iso,
        endIsoDate,
        weekday: weekday.name,
        status: 'contradictory',
        reason: `${weekday.name} does not match ${iso} (${weekdayNameFromIsoDate(iso)})`,
      };
    }
    return {
      isoDate: iso,
      endIsoDate,
      weekday: weekday?.name ?? weekdayNameFromIsoDate(iso),
      status: 'resolved',
      reason: yearStated ? 'stated_date' : 'resolved_without_inventing_weekday',
    };
  };

  if (stated) return check(stated, true);
  if (slash) return check(slash.iso, slash.yearStated);

  if (md?.year) {
    const iso = isoFromParts(md.year, md.month, md.day);
    if (iso) return check(iso, true);
  }

  if (md && !md.year) {
    const thisYear = isoFromParts(now.getUTCFullYear(), md.month, md.day);
    const nextYear = isoFromParts(now.getUTCFullYear() + 1, md.month, md.day);
    if (weekday && thisYear && utcWeekdayFromIsoDate(thisYear) === weekday.index) {
      return check(thisYear, false);
    }
    if (weekday && nextYear && utcWeekdayFromIsoDate(nextYear) === weekday.index) {
      return check(nextYear, false);
    }
    if (weekday) {
      return {
        isoDate: null,
        endIsoDate,
        weekday: weekday.name,
        status: 'contradictory',
        reason: 'month_day_does_not_match_weekday_in_this_or_next_year',
      };
    }
    if (thisYear) {
      const today = chicagoCalendarIso(now);
      const windowEnd = addUtcDays(today, 366);
      const windowStart = addUtcDays(today, -14);
      if (thisYear >= windowStart && thisYear <= windowEnd) {
        return { isoDate: thisYear, endIsoDate, weekday: weekdayNameFromIsoDate(thisYear), status: 'resolved', reason: 'month_day_in_current_window' };
      }
    }
    return { isoDate: null, endIsoDate, weekday: null, status: 'uncertain', reason: 'year_not_stated' };
  }

  if (weekday) {
    const iso = nextWeekdayIso(Number.isNaN(anchor.getTime()) ? now : anchor, weekday.index);
    return { isoDate: iso, endIsoDate, weekday: weekday.name, status: 'resolved', reason: 'weekday_from_anchor' };
  }

  if (/\b(tonight|today)\b/i.test(text) && input.publishedAt && !Number.isNaN(anchor.getTime())) {
    const iso = chicagoCalendarIso(anchor);
    return { isoDate: iso, endIsoDate, weekday: weekdayNameFromIsoDate(iso), status: 'resolved', reason: 'tonight_from_publication_day' };
  }

  return { isoDate: null, endIsoDate, weekday: null, status: 'uncertain', reason: 'no_date' };
}

export function reconcileStatedDateWithWeekday(input: {
  statedIso: string | null;
  text: string;
  publishedAt?: string | null;
  now?: Date;
}): DateTrustResult {
  const resolved = resolveWatchlistDate({
    text: input.text,
    publishedAt: input.publishedAt,
    now: input.now,
    statedIso: input.statedIso,
  });
  if (resolved.status !== 'contradictory' || !explicitWeekdayFromText(input.text)) return resolved;
  const weekday = explicitWeekdayFromText(input.text)!;
  const anchor = input.publishedAt ? new Date(input.publishedAt) : input.now ?? new Date();
  const repaired = nextWeekdayIso(anchor, weekday.index);
  if (utcWeekdayFromIsoDate(repaired) === weekday.index) {
    return {
      isoDate: repaired,
      endIsoDate: resolved.endIsoDate,
      weekday: weekday.name,
      status: 'resolved',
      reason: `replaced_contradictory_date:${resolved.isoDate}->${repaired}`,
    };
  }
  return { isoDate: null, endIsoDate: resolved.endIsoDate, weekday: weekday.name, status: 'contradictory', reason: resolved.reason };
}

export function isIsoExpired(iso: string | null, now: Date, endIso?: string | null): boolean {
  const effective = endIso ?? iso;
  if (!effective) return false;
  const today = chicagoCalendarIso(now);
  return effective < today;
}
