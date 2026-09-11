/**
 * Standards-aware ICS (iCalendar) parser for public event feeds / per-event .ics.
 * Handles folded lines, escaped text, UTC/Z, TZID, DATE (all-day), and RECURRENCE-ID.
 * Does not expand RRULE into day explosions — callers keep a single VEVENT span.
 */

export type IcsDateValue = {
  /** Calendar date in the resolved zone (or floating/UTC date for DATE values). */
  date: string;
  /** Local wall clock HH:mm:ss when timed; null for all-day. */
  time: string | null;
  /** ISO-like instant when known (UTC Z or offset); null for floating/all-day. */
  utcIso: string | null;
  allDay: boolean;
  raw: string;
  tzid: string | null;
};

export type IcsEvent = {
  uid: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  url: string | null;
  dtstart: IcsDateValue | null;
  dtend: IcsDateValue | null;
  recurrenceId: IcsDateValue | null;
  rawProps: Record<string, string>;
};

export type IcsParseResult = {
  events: IcsEvent[];
  prodid: string | null;
  calscale: string | null;
};

function unfoldIcs(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function splitProp(line: string): { name: string; params: Record<string, string>; value: string } {
  const colon = line.indexOf(':');
  if (colon < 0) return { name: line.trim().toUpperCase(), params: {}, value: '' };
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(';');
  const name = (parts[0] ?? '').trim().toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    params[p.slice(0, eq).trim().toUpperCase()] = p.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

/** Format a Date instant into YMD + HMS in an IANA zone (no silent UTC YMD). */
export function instantToZonedParts(
  instant: Date,
  timeZone: string,
): { date: string; time: string; offsetLabel: string | null } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}:${get('second')}`;
  const offsetLabel = parts.find((p) => p.type === 'timeZoneName')?.value ?? null;
  return { date, time, offsetLabel };
}

function parseIcsDateTime(
  rawValue: string,
  params: Record<string, string>,
  preferTimeZone?: string | null,
): IcsDateValue {
  const raw = rawValue.trim();
  const valueType = (params.VALUE ?? '').toUpperCase();
  const tzid = params.TZID ?? null;

  // All-day DATE
  if (valueType === 'DATE' || /^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return {
      date: `${y}-${m}-${d}`,
      time: null,
      utcIso: null,
      allDay: true,
      raw,
      tzid,
    };
  }

  const m = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/,
  );
  if (!m) {
    return { date: '', time: null, utcIso: null, allDay: false, raw, tzid };
  }
  const [, yy, mo, dd, hh, mi, ss, z] = m;
  const sec = ss ?? '00';

  if (z === 'Z') {
    const utcIso = `${yy}-${mo}-${dd}T${hh}:${mi}:${sec}Z`;
    const instant = new Date(utcIso);
    if (preferTimeZone) {
      const zoned = instantToZonedParts(instant, preferTimeZone);
      return {
        date: zoned.date,
        time: zoned.time,
        utcIso,
        allDay: false,
        raw,
        tzid: preferTimeZone,
      };
    }
    return {
      date: `${yy}-${mo}-${dd}`,
      time: `${hh}:${mi}:${sec}`,
      utcIso,
      allDay: false,
      raw,
      tzid: 'UTC',
    };
  }

  // Floating or TZID local — keep wall components; do not invent UTC.
  return {
    date: `${yy}-${mo}-${dd}`,
    time: `${hh}:${mi}:${sec}`,
    utcIso: null,
    allDay: false,
    raw,
    tzid,
  };
}

function parseVEvent(lines: string[], preferTimeZone?: string | null): IcsEvent {
  const rawProps: Record<string, string> = {};
  let uid: string | null = null;
  let summary: string | null = null;
  let description: string | null = null;
  let location: string | null = null;
  let url: string | null = null;
  let dtstart: IcsDateValue | null = null;
  let dtend: IcsDateValue | null = null;
  let recurrenceId: IcsDateValue | null = null;

  for (const line of lines) {
    const { name, params, value } = splitProp(line);
    const text = unescapeIcsText(value);
    rawProps[name] = text;
    switch (name) {
      case 'UID':
        uid = text.trim() || null;
        break;
      case 'SUMMARY':
        summary = text.trim() || null;
        break;
      case 'DESCRIPTION':
        description = text.trim() || null;
        break;
      case 'LOCATION':
        location = text.trim() || null;
        break;
      case 'URL':
        url = text.trim() || null;
        break;
      case 'DTSTART':
        dtstart = parseIcsDateTime(value, params, preferTimeZone);
        break;
      case 'DTEND':
        dtend = parseIcsDateTime(value, params, preferTimeZone);
        break;
      case 'RECURRENCE-ID':
        recurrenceId = parseIcsDateTime(value, params, preferTimeZone);
        break;
      default:
        break;
    }
  }

  return {
    uid,
    summary,
    description,
    location,
    url,
    dtstart,
    dtend,
    recurrenceId,
    rawProps,
  };
}

/**
 * Parse ICS text into VEVENT records.
 * @param preferTimeZone When set (e.g. America/Chicago from Squarespace context),
 *   UTC DTSTART/DTEND are projected to that zone so local calendar dates are preserved.
 */
export function parseIcsCalendar(
  icsText: string,
  options?: { preferTimeZone?: string | null },
): IcsParseResult {
  const unfolded = unfoldIcs(icsText);
  const lines = unfolded.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const events: IcsEvent[] = [];
  let prodid: string | null = null;
  let calscale: string | null = null;
  let inEvent = false;
  let buf: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('PRODID:')) {
      prodid = line.slice(line.indexOf(':') + 1).trim();
      continue;
    }
    if (upper.startsWith('CALSCALE:')) {
      calscale = line.slice(line.indexOf(':') + 1).trim();
      continue;
    }
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      buf = [];
      continue;
    }
    if (upper === 'END:VEVENT') {
      if (inEvent) events.push(parseVEvent(buf, options?.preferTimeZone ?? null));
      inEvent = false;
      buf = [];
      continue;
    }
    if (inEvent) buf.push(line);
  }

  return { events, prodid, calscale };
}

/** Occurrence key for dedupe: UID + RECURRENCE-ID or UID + DTSTART. */
export function icsOccurrenceKey(ev: IcsEvent): string | null {
  if (!ev.uid?.trim()) return null;
  const occ =
    ev.recurrenceId?.raw ??
    ev.dtstart?.raw ??
    ev.dtstart?.date ??
    '';
  return `ics:${ev.uid.trim()}|${occ}`;
}
