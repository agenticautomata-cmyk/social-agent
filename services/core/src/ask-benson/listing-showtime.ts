/**
 * Listing/card showtime overlay: hub JSON-LD often stores UTC midnight
 * placeholders while the linked ticket/detail card carries the real clock.
 */
import type { ExtractedOpportunity } from './listing-extract.js';
import { isTrustworthyListingClock, parseJsonLdPageGraph } from './jsonld-events.js';

const SLASH_CLOCK_RE =
  /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\s+(\d{1,2}:\d{2}\s*[ap]\.?m\.?)\b/i;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(raw: string | null | undefined): string | null {
  const slice = (raw ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

export function normalizeListingClock(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ap = (m[3] ?? '').replace(/\./g, '').toLowerCase();
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;
  if (ap === 'am' || ap === 'pm') {
    if (hour < 1 || hour > 12) return null;
    if (ap === 'am') {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
  } else if (hour > 23) {
    return null;
  }
  return `${pad(hour)}:${pad(minute)}:00`;
}

export function parseListingCardShowtime(text: string): { date: string; time: string | null } | null {
  const match = SLASH_CLOCK_RE.exec(text);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const clockRaw = match[4]!.replace(/\s+/g, ' ').trim();
  const ampm = clockRaw.match(/([ap])\.?m\.?$/i)?.[1]?.toLowerCase();
  const time = normalizeListingClock(clockRaw);
  if (!time) return { date, time: null };
  const hour = Number(time.slice(0, 2));
  if (ampm === 'a' && hour >= 1 && hour <= 5) return { date, time: null };
  if (!isTrustworthyListingClock(time)) return { date, time: null };
  return { date, time };
}

function isEarlyMorningClock(clockHms: string | null | undefined): boolean {
  const hour = Number((clockHms ?? '').slice(0, 2));
  return Number.isFinite(hour) && hour >= 1 && hour <= 5;
}

function evidenceHasEarlyAmChrome(text: string): boolean {
  return /\b0?[1-5]:\d{2}\s*a\.?m\.?\b/i.test(text);
}

function jsonLdClockForTitle(
  html: string | null | undefined,
  title: string,
): { date: string | null; time: string | null } {
  if (!html?.trim()) return { date: null, time: null };
  const events = parseJsonLdPageGraph(html).events;
  if (events.length === 0) return { date: null, time: null };
  const lowered = title.trim().toLowerCase();
  const named =
    events.find((ev) => lowered && ev.name.trim().toLowerCase() && lowered.includes(ev.name.trim().toLowerCase())) ??
    events[0]!;
  return { date: named.startDate, time: named.startTime };
}

export function overlayListingShowtime(
  opp: ExtractedOpportunity,
  evidence: { title?: string | null; html?: string | null; text?: string | null },
): ExtractedOpportunity {
  let date = dateKey(opp.eventDate);
  let time =
    opp.startTime && isTrustworthyListingClock(opp.startTime) && !opp.eventDate?.includes('T00:00:00')
      ? opp.startTime
      : null;
  if (opp.eventDate?.includes('T00:00:00')) time = null;

  const evidenceBlob = `${evidence.title ?? ''} ${evidence.text ?? ''} ${opp.title}`;
  if (/\btime:\s*tbd\b|\btbd\b/i.test(evidenceBlob)) {
    if (!date) return opp;
    return { ...opp, startTime: null, eventDate: date };
  }

  const card = parseListingCardShowtime(`${evidence.title ?? ''} ${evidence.text ?? ''}`);
  const ticketChromeAm =
    evidenceHasEarlyAmChrome(evidenceBlob) || (card != null && card.time == null && evidenceHasEarlyAmChrome(`${evidence.title ?? ''} ${evidence.text ?? ''}`));

  const jsonLd = jsonLdClockForTitle(evidence.html, evidence.title || opp.title);
  if (jsonLd.date && (!date || jsonLd.date === date)) date = jsonLd.date;
  const jsonLdIsTicketChrome =
    Boolean(jsonLd.time) && isEarlyMorningClock(jsonLd.time) && ticketChromeAm;
  if (
    jsonLd.time &&
    isTrustworthyListingClock(jsonLd.time) &&
    !jsonLdIsTicketChrome &&
    (!date || jsonLd.date === date || !jsonLd.date)
  ) {
    time = jsonLd.time;
    if (jsonLd.date) date = jsonLd.date;
  }

  if (card && (!date || card.date === date)) {
    date = date ?? card.date;
    if (card.time && isTrustworthyListingClock(card.time)) time = card.time;
    else if (ticketChromeAm) time = null;
  } else if (ticketChromeAm && isEarlyMorningClock(time)) {
    time = null;
  }

  if (!date) return opp;
  return {
    ...opp,
    startTime: time,
    eventDate: time ? `${date}T${time}` : date,
  };
}
