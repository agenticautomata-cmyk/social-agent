import type { ExtractedNewsletterItem } from './types.js';

export type ParsedIcsEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtStart: string | null;
  dtEnd: string | null;
  timezone: string | null;
  organizer: string | null;
  url: string | null;
  status: string | null;
  sequence: number | null;
  recurrence: string | null;
};

function unfoldIcsLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseIcsDateValue(value: string, tzid?: string | null): { date: string | null; time: string | null; timezone: string | null } {
  const clean = value.trim();
  if (/^\d{8}T\d{6}Z$/i.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const hh = clean.slice(9, 11);
    const mm = clean.slice(11, 13);
    return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}`, timezone: 'UTC' };
  }
  if (/^\d{8}T\d{6}$/i.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const hh = clean.slice(9, 11);
    const mm = clean.slice(11, 13);
    return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}`, timezone: tzid ?? 'America/Chicago' };
  }
  if (/^\d{8}$/.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return { date: `${y}-${m}-${d}`, time: null, timezone: tzid ?? 'America/Chicago' };
  }
  return { date: null, time: null, timezone: tzid ?? null };
}

function parseProperty(line: string): { key: string; params: Record<string, string>; value: string } | null {
  const idx = line.indexOf(':');
  if (idx <= 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1).trim();
  const [key, ...paramParts] = left.split(';');
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { key: key!.toUpperCase(), params, value };
}

export function parseIcsContent(raw: string): ParsedIcsEvent[] {
  const lines = unfoldIcsLines(raw);
  const events: ParsedIcsEvent[] = [];
  let current: Partial<ParsedIcsEvent> | null = null;
  let dtStartTz: string | null = null;
  let dtEndTz: string | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      dtStartTz = null;
      dtEndTz = null;
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.uid && current.summary) {
        events.push({
          uid: current.uid,
          summary: current.summary,
          description: current.description ?? null,
          location: current.location ?? null,
          dtStart: current.dtStart ?? null,
          dtEnd: current.dtEnd ?? null,
          timezone: current.timezone ?? 'America/Chicago',
          organizer: current.organizer ?? null,
          url: current.url ?? null,
          status: current.status ?? null,
          sequence: current.sequence ?? null,
          recurrence: current.recurrence ?? null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parseProperty(line);
    if (!prop) continue;

    switch (prop.key) {
      case 'UID':
        current.uid = prop.value;
        break;
      case 'SUMMARY':
        current.summary = prop.value;
        break;
      case 'DESCRIPTION':
        current.description = prop.value;
        break;
      case 'LOCATION':
        current.location = prop.value;
        break;
      case 'DTSTART': {
        dtStartTz = prop.params.TZID ?? null;
        const parsed = parseIcsDateValue(prop.value, dtStartTz);
        current.dtStart = parsed.date;
        current.timezone = parsed.timezone;
        if (parsed.time) (current as Record<string, unknown>)._startTime = parsed.time;
        break;
      }
      case 'DTEND': {
        dtEndTz = prop.params.TZID ?? null;
        const parsed = parseIcsDateValue(prop.value, dtEndTz);
        current.dtEnd = parsed.date;
        if (parsed.time) (current as Record<string, unknown>)._endTime = parsed.time;
        break;
      }
      case 'ORGANIZER':
        current.organizer = prop.value.replace(/^mailto:/i, '');
        break;
      case 'URL':
        current.url = prop.value;
        break;
      case 'STATUS':
        current.status = prop.value;
        break;
      case 'SEQUENCE':
        current.sequence = Number.parseInt(prop.value, 10);
        break;
      case 'RRULE':
        current.recurrence = prop.value;
        break;
    }
  }

  return events;
}

export function icsEventsToNewsletterItems(events: ParsedIcsEvent[]): ExtractedNewsletterItem[] {
  return events.map((event) => {
    const startTime = (event as ParsedIcsEvent & { _startTime?: string })._startTime ?? null;
    const endTime = (event as ParsedIcsEvent & { _endTime?: string })._endTime ?? null;
    return {
      entityName: event.summary,
      entityType: 'event_venue',
      occurrenceType: 'general_event',
      title: event.summary,
      description: event.description,
      startDate: event.dtStart,
      endDate: event.dtEnd,
      startTime,
      endTime,
      timezone: event.timezone,
      venue: event.location,
      streetAddress: null,
      city: null,
      state: null,
      zipCode: null,
      neighborhood: null,
      price: null,
      isFree: null,
      ageRestriction: null,
      rsvpRequired: null,
      reservationLink: null,
      ticketLink: event.url,
      officialWebsite: event.url,
      officialSocialLink: null,
      phone: null,
      organizer: event.organizer,
      sourceUrl: event.url,
      confidence: 0.88,
      layer: event.dtStart ? 'occurrence' : 'entity',
    };
  });
}

export function icsUidFingerprint(uid: string): string {
  return uid.trim().toLowerCase();
}
