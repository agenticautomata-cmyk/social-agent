/**
 * Pre-LLM segmentation of editorial/listing container pages into dated child
 * event cards. Does not classify containers — callers pass editorialContainer.
 */
import type { ExtractedOpportunity } from './listing-extract.js';
import { looksLikeEditorialContainerTitle, titlesMatch } from './editorial-container.js';
import { composeJsonLdOpportunityDates, parseJsonLdPageGraph } from './jsonld-events.js';

export type ContainerEventBlock = {
  text: string;
  title: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  startTime: string | null;
  venue: string | null;
  location: string | null;
  sourceUrl: string | null;
  structured: boolean;
};

export type ContainerExtractionPrep = {
  blocks: ContainerEventBlock[];
  chunks: string[];
  structuredOpportunities: ExtractedOpportunity[];
  shouldSplit: boolean;
  usedDelimiters: string[];
};

const MONTH =
  'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const WEEKDAY =
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun';
const CLOCK = '\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)';

const WEEKDAY_DATE_RE = new RegExp(
  `\\b(?:${WEEKDAY}),?\\s+(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`,
  'gi',
);
const DATE_FIRST_RE = new RegExp(
  `\\b(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(20\\d{2})\\s+(${CLOCK})\\b`,
  'gi',
);
const CLOCK_RE = new RegExp(`\\b(${CLOCK})\\b`, 'gi');
const CARD_DELIMITERS = [/\bView Event\b/gi, /\bView Tickets\b/gi, /\bGet Tickets\b/gi];
const CHUNK_CHARS = 3800;
const MAX_CHILDREN = 40;

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const CHROME_TITLE_RE =
  /^(?:skip to content|open menu|close menu|all events|events|schedule|calendar|home|menu|search|sign up|subscribe|contact|cookie|privacy|terms|google calendar|ics|view event|view tickets|next show|next family show|on this page|upcoming (?:family )?shows|family shows calendar|updated(?: daily)?)$/i;

const META_DATE_PREFIX_RE =
  /\b(?:updated|published|posted|last\s+updated|as\s+of|schedules?\s+updated)\s*[:.]?\s*$/i;

const MARKETING_PHRASE_RE =
  /^(?:high\s+demand|weekend\s+event|best\s+value|from\s*\$|tickets?\s+available|avg\.?\s*price|next\s+show|lowest\s+price|average\s+price)$/i;

export function decodeListingEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#8594;|&rarr;/gi, '')
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(monthName: string, day: string, year: string): string | null {
  const month = MONTH_INDEX[monthName.toLowerCase().replace(/\./g, '')];
  const d = Number(day);
  const y = Number(year);
  if (month == null || !Number.isFinite(d) || d < 1 || d > 31 || y < 2018) return null;
  return `${y}-${pad(month + 1)}-${pad(d)}`;
}

function normalizeClock(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ampm = m[3]!.replace(/\./g, '').toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (ampm === 'am') {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return `${pad(hour)}:${pad(minute)}:00`;
}

function clocksIn(text: string): string[] {
  return [...text.matchAll(CLOCK_RE)].map((m) => m[1]!.replace(/\s+/g, ' ').trim());
}

function stripChromeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function containerPageTextFromHtml(html: string): string {
  return decodeListingEntities(stripChromeHtml(html).replace(/\s+/g, ' ').trim());
}

function isChromeTitle(title: string | null | undefined): boolean {
  const t = (title ?? '').trim();
  if (!t) return true;
  if (t.length < 4) return true;
  if (CHROME_TITLE_RE.test(t)) return true;
  if (/^(?:home|about|contact|faq|map|parking|donate)$/i.test(t)) return true;
  if (/google calendar|view event|view tickets|skip to|open menu/i.test(t)) return true;
  return false;
}

function looksLikeMetaDate(prefix: string): boolean {
  return META_DATE_PREFIX_RE.test(prefix.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleFromPrefix(prefix: string, pageTitle?: string | null): string {
  let s = decodeListingEntities(prefix);
  s = stripParentTitle(s, pageTitle);
  const parts = s.split(/\b(?:view event|all events|google calendar ics)\b/i);
  s = cleanTitle(parts[parts.length - 1] ?? s);
  if (s.length > 70) {
    const words = s.split(/\s+/).filter(Boolean);
    s = cleanTitle(words.slice(-8).join(' '));
  }
  return s;
}

function stripParentTitle(raw: string, pageTitle?: string | null): string {
  let s = raw;
  if (pageTitle?.trim()) {
    s = s.replace(new RegExp(escapeRegExp(decodeListingEntities(pageTitle)), 'ig'), ' ');
    s = s.replace(new RegExp(escapeRegExp(pageTitle), 'ig'), ' ');
  }
  s = s.replace(/^events?\s+in\s+[A-Za-z .'-]+(?:—|-|–|&mdash;)\s*[A-Za-z .'-]+/i, ' ');
  return s;
}

function cleanTitle(raw: string): string {
  let s = decodeListingEntities(raw);
  s = s.replace(/\bGoogle Calendar ICS\b/gi, ' ');
  s = s.replace(/\b(?:View Event|View Tickets|Get Tickets|Check out)\b.*$/i, ' ');
  s = s.replace(
    /\b(?:skip to content|open menu|close menu|explore all categories|downtown events|all events|folder:|get involved|plan your visit)\b/gi,
    ' ',
  );
  s = s.replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9"]+/, '').trim();
  s = s.replace(new RegExp(`^(?:(?:${MONTH})\\.?\\s+\\d{1,2}(?:\\s+to\\s+(?:${MONTH})\\.?\\s+\\d{1,2})?\\s+)+`, 'i'), '');
  s = s.replace(/^\d{1,2}\s+/, '');
  return s.replace(/^[^A-Za-z0-9"]+/, '').replace(/[:|–—-]\s*$/, '').trim();
}

function collapseAdjacentRepeat(value: string): string {
  let s = value.replace(/\s+/g, ' ').trim();
  for (let guard = 0; guard < 4; guard++) {
    const tokens = s.split(' ');
    let hit = false;
    for (let i = Math.min(16, Math.floor(tokens.length / 2)); i >= 2; i--) {
      const left = tokens.slice(0, i).join(' ');
      const right = tokens.slice(i).join(' ');
      if (right.toLowerCase().startsWith(left.toLowerCase())) {
        s = `${left} ${right.slice(left.length).trim()}`.replace(/\s+/g, ' ').trim();
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  return s;
}

function splitTitleAndVenue(raw: string): { title: string; venue: string | null } {
  const collapsed = collapseAdjacentRepeat(
    raw
      .replace(/\s*:\s*/g, ': ')
      .replace(/From\s*\$.*$/i, ' ')
      .replace(/\b\d{5}\b.*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!collapsed) return { title: '', venue: null };

  const tokens = collapsed.split(' ');
  for (let i = Math.min(14, Math.floor(tokens.length / 2)); i >= 2; i--) {
    const title = tokens.slice(0, i).join(' ');
    const rest = tokens.slice(i).join(' ');
    if (rest.toLowerCase().startsWith(title.toLowerCase())) {
      const venueRaw = sanitizeVenue(collapseAdjacentRepeat(rest.slice(title.length).trim()));
      return { title: cleanTitle(title), venue: venueRaw };
    }
  }

  const trailingVenue = collapsed.match(
    /\s+((?:The\s+)?(?:[A-Z][\w'.-]*\s+)+(?:Theatre|Theater|Center|Mall|Hall|Arena|Stadium|Park|Plaza|Museum|Auditorium|Pavilion|Library|Hotel)(?:\s*[-–—•]\s*.+)?)$/,
  );
  if (trailingVenue?.[1]) {
    const title = cleanTitle(collapsed.slice(0, trailingVenue.index).trim());
    if (title.split(/\s+/).length >= 2) {
      return { title, venue: sanitizeVenue(trailingVenue[1]) };
    }
  }

  return { title: cleanTitle(collapsed), venue: null };
}

function skipLeadTokens(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (new RegExp(`^(?:${WEEKDAY})$`, 'i').test(tok)) {
      i += 1;
      continue;
    }
    if (/^[A-Z][A-Z&/]{1,24}$/.test(tok) && tok.length >= 2) {
      i += 1;
      continue;
    }
    if (tok === '/' || tok === '·' || tok === '•') {
      i += 1;
      continue;
    }
    const pair = `${tok} ${tokens[i + 1] ?? ''}`.trim();
    if (MARKETING_PHRASE_RE.test(tok) || MARKETING_PHRASE_RE.test(pair)) {
      i += MARKETING_PHRASE_RE.test(pair) ? 2 : 1;
      continue;
    }
    break;
  }
  return tokens.slice(i).join(' ');
}

function sanitizeVenue(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let s = decodeListingEntities(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (/<|>|class=|datetime=/i.test(s)) return null;
  if (/^\d{1,2}:\d{2}\s*(?:am|pm)/i.test(s)) return null;
  s = s.replace(/\s*•\s*\d+\s+seats?/i, '').replace(/\(map\)/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 3) return null;
  const words = s.split(' ');
  if (words.length > 10) s = words.slice(0, 10).join(' ');
  return s;
}

function venueFromSuffix(suffix: string): string | null {
  let s = decodeListingEntities(suffix).replace(/<[^>]+>/g, ' ');
  s = s.replace(/\bGoogle Calendar ICS\b[\s\S]*$/i, ' ');
  s = s.replace(/\b(?:View Event|View Tickets|Get Tickets)\b[\s\S]*$/i, ' ');
  s = s.replace(/\(map\)/gi, ' ');
  const zip = s.search(/\b\d{5}\b/);
  if (zip >= 0) s = s.slice(0, zip);
  s = s.replace(CLOCK_RE, ' ').replace(/From\s*\$.*$/i, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 3) return null;
  if (/^(?:free|tickets?|purchase|recharge|check out)\b/i.test(s)) return null;
  return sanitizeVenue(s);
}

/** Artist/band tour listing paths (Squarespace /shows, etc.) — not civic /events hubs. */
function isArtistTourListingUrl(pageUrl: string): boolean {
  try {
    const path = new URL(pageUrl).pathname.toLowerCase().replace(/\/+$/, '') || '/';
    return /\/(shows?|tour(?:-?dates)?|concerts?|gigs?)$/.test(path);
  } catch {
    return false;
  }
}

function cleanTourPerformerName(raw: string): string | null {
  let s = decodeListingEntities(raw).replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*[|].*$/, '').replace(/\s+/g, ' ').trim();
  if (s.length < 3 || s.length > 80) return null;
  if (looksLikeEditorialContainerTitle(s)) return null;
  if (/^(?:upcoming\s+)?(?:shows?|tour|concerts?|gigs?|events?)$/i.test(s)) return null;
  return s;
}

/**
 * Recover performer/tour identity from "Shows — Artist" page titles (or reverse).
 * Does not invent a name when the parent title is a civic/editorial hub.
 */
export function tourPerformerFromPageTitle(pageTitle?: string | null): string | null {
  if (!pageTitle?.trim()) return null;
  const t = decodeListingEntities(pageTitle).replace(/\s+/g, ' ').trim();
  const lead = t.match(
    /^(?:upcoming\s+)?(?:shows?|tour(?:\s+dates?)?|concerts?|gigs?)\s*[—–\-|:]\s*(.+)$/i,
  );
  if (lead?.[1]) return cleanTourPerformerName(lead[1]);
  const trail = t.match(
    /^(.+?)\s*[—–\-|:]\s*(?:upcoming\s+)?(?:shows?|tour(?:\s+dates?)?|concerts?|gigs?)$/i,
  );
  if (trail?.[1]) return cleanTourPerformerName(trail[1]);
  return null;
}

function tourPerformerFromWebsiteJsonLd(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]!.trim()) as Record<string, unknown>;
      const type = String(data['@type'] ?? '')
        .split('/')
        .pop()
        ?.toLowerCase();
      if (!type || !/^(website|musicgroup|musicartist|person|organization|performinggroup)$/.test(type)) {
        continue;
      }
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const cleaned = cleanTourPerformerName(name);
      if (cleaned) return cleaned;
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }
  return null;
}

export function resolveTourPerformer(input: {
  pageTitle?: string | null;
  pageUrl: string;
  pageHtml?: string | null;
}): string | null {
  if (!isArtistTourListingUrl(input.pageUrl)) return null;
  return tourPerformerFromPageTitle(input.pageTitle) ?? tourPerformerFromWebsiteJsonLd(input.pageHtml);
}

function stripTourChromeFromVenueLabel(raw: string): string {
  let s = decodeListingEntities(raw).replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:upcoming\s+)?shows?\s+/i, '').trim();
  s = s.replace(new RegExp(`^(?:${MONTH})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+`, 'i'), '').trim();
  return s || raw.trim();
}

/** City/locality trailing a venue label (e.g. "Tin Roof Delray Beach" → "Delray Beach"). */
export function cityFromVenueLabel(venue: string | null | undefined): string | null {
  const raw = (venue ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const multi =
    raw.match(
      /\s+((?:Fort|North|South|West|East|Saint|St\.?)\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)?|[A-Z][A-Za-z.'-]+\s+(?:Beach|City|Park|Falls|Springs|Hills|Valley|Grove|Heights))$/,
    ) ??
    raw.match(/\s+([A-Z][A-Za-z.'-]{3,})$/);
  if (!multi?.[1]) return null;
  const city = multi[1]!.trim();
  const prefix = raw.slice(0, multi.index).trim();
  if (prefix.split(/\s+/).filter(Boolean).length < 1) return null;
  if (/^(?:the)$/i.test(prefix)) return null;
  // Venue-type / event-type final tokens are not cities (e.g. "Limitless Brewing", "BBQ Fest").
  if (
    /^(?:brewing|brewery|tavern|saloon|bar|pub|club|hall|theatre|theater|center|centre|arena|stadium|park|plaza|museum|auditorium|pavilion|library|hotel|levee|kitchen|cafe|café|grill|lounge|fest|festival|fair|expo|show|shows|concert|reunion|jam|bash|live|night|bbq)$/i.test(
      city,
    )
  ) {
    return null;
  }
  return city;
}

/**
 * On artist tour listings, Squarespace-style cards use the venue as the event H1.
 * Promote that string into venue/location and title the child as a performance.
 */
export function promoteVenueOnlyTourChild(
  block: ContainerEventBlock,
  performer: string | null,
): ContainerEventBlock {
  if (!performer?.trim() || !block.title?.trim()) return block;
  if (block.venue?.trim()) return block;
  if (titlesMatch(block.title, performer)) return block;
  if (/\bat\b/i.test(block.title)) return block;
  if (isChromeTitle(block.title) || looksLikeEditorialContainerTitle(block.title)) return block;
  const venue = sanitizeVenue(stripTourChromeFromVenueLabel(block.title));
  if (!venue) return block;
  const city = cityFromVenueLabel(venue);
  return {
    ...block,
    title: `${performer.trim()} at ${venue}`,
    venue,
    location: city ?? venue,
  };
}

function parseDateFirstCard(card: string, pageUrl: string, pageTitle?: string | null): ContainerEventBlock | null {
  DATE_FIRST_RE.lastIndex = 0;
  const match = DATE_FIRST_RE.exec(card);
  if (!match) return null;
  const iso = toIsoDate(match[1]!, match[2]!, match[3]!);
  if (!iso) return null;
  const clockRaw = match[4]!.replace(/\s+/g, ' ').trim();
  const startTime = normalizeClock(clockRaw);
  const after = skipLeadTokens(card.slice(match.index + match[0].length));
  const { title, venue } = splitTitleAndVenue(stripParentTitle(after, pageTitle));
  if (isChromeTitle(title) || looksLikeEditorialContainerTitle(title) || titlesMatch(title, pageTitle)) return null;
  return {
    text: card.slice(0, 700).trim(),
    title,
    eventDate: startTime ? `${iso}T${startTime}` : iso,
    eventEndDate: null,
    startTime,
    venue,
    location: venue,
    sourceUrl: pageUrl,
    structured: true,
  };
}

function parseWeekdayDateCard(card: string, pageUrl: string, pageTitle?: string | null): ContainerEventBlock | null {
  WEEKDAY_DATE_RE.lastIndex = 0;
  const dates = [...card.matchAll(WEEKDAY_DATE_RE)];
  if (dates.length === 0) return null;
  const primary = dates[0]!;
  const prefix = card.slice(0, primary.index);
  if (looksLikeMetaDate(prefix)) return null;
  const title = titleFromPrefix(prefix, pageTitle);
  if (isChromeTitle(title) || looksLikeEditorialContainerTitle(title) || titlesMatch(title, pageTitle)) return null;
  const iso = toIsoDate(primary[1]!, primary[2]!, primary[3]!);
  if (!iso) return null;

  const afterPrimary = card.slice((primary.index ?? 0) + primary[0].length);
  const clocks = clocksIn(
    dates.length > 1 ? afterPrimary.slice(0, dates[1]!.index! - (primary.index ?? 0) - primary[0].length) : afterPrimary,
  );
  const startClock = clocks[0] ?? null;
  const startTime = startClock ? normalizeClock(startClock) : null;

  let eventEndDate: string | null = null;
  if (dates.length > 1) {
    const end = dates[1]!;
    eventEndDate = toIsoDate(end[1]!, end[2]!, end[3]!);
    const endClocks = clocksIn(card.slice((end.index ?? 0) + end[0].length));
    const endTime = endClocks[0] ? normalizeClock(endClocks[0]) : null;
    if (eventEndDate && endTime) eventEndDate = `${eventEndDate}T${endTime}`;
  } else if (clocks[1]) {
    const endTime = normalizeClock(clocks[1]);
    if (endTime) eventEndDate = `${iso}T${endTime}`;
  }

  const afterTimes = afterPrimary.replace(CLOCK_RE, ' ').replace(WEEKDAY_DATE_RE, ' ');
  const venue = venueFromSuffix(afterTimes);

  return {
    text: card.slice(0, 700).trim(),
    title,
    eventDate: startTime ? `${iso}T${startTime}` : iso,
    eventEndDate,
    startTime,
    venue,
    location: venue,
    sourceUrl: pageUrl,
    structured: true,
  };
}

function parseCard(card: string, pageUrl: string, pageTitle?: string | null): ContainerEventBlock | null {
  const trimmed = decodeListingEntities(card).replace(/\s+/g, ' ').trim();
  if (trimmed.length < 12) return null;
  DATE_FIRST_RE.lastIndex = 0;
  WEEKDAY_DATE_RE.lastIndex = 0;
  const dateFirst = DATE_FIRST_RE.exec(trimmed);
  const weekday = WEEKDAY_DATE_RE.exec(trimmed);
  if (dateFirst && (!weekday || (dateFirst.index ?? 0) <= (weekday.index ?? 0))) {
    return parseDateFirstCard(trimmed, pageUrl, pageTitle);
  }
  if (weekday) return parseWeekdayDateCard(trimmed, pageUrl, pageTitle);
  return null;
}

function splitOnDelimiters(text: string): { cards: string[]; used: string[] } {
  const used: string[] = [];
  for (const re of CARD_DELIMITERS) {
    re.lastIndex = 0;
    const hits = text.match(re) ?? [];
    if (hits.length >= 2) {
      used.push(hits[0]!);
      const cards = text
        .split(re)
        .map((part) => part.trim())
        .filter((part) => part.length > 16);
      return { cards, used };
    }
  }
  return { cards: [], used };
}

function splitOnDateAnchors(text: string): string[] {
  const matches: { index: number; length: number }[] = [];
  for (const re of [DATE_FIRST_RE, WEEKDAY_DATE_RE]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (m.index == null) continue;
      const prefix = text.slice(Math.max(0, m.index - 40), m.index);
      if (looksLikeMetaDate(prefix)) continue;
      matches.push({ index: m.index, length: m[0].length });
    }
  }
  matches.sort((a, b) => a.index - b.index);
  const starts: number[] = [];
  for (const m of matches) {
    const prev = starts[starts.length - 1];
    if (prev != null && m.index - prev < 24) continue;
    starts.push(m.index);
  }
  if (starts.length < 2) return starts.length === 1 ? [text] : [];
  const cards: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = i === 0 ? Math.max(0, starts[i]! - 160) : starts[i]!;
    const to = i + 1 < starts.length ? starts[i + 1]! : Math.min(text.length, starts[i]! + 420);
    cards.push(text.slice(from, to).trim());
  }
  return cards;
}

function extractHeadingTimeCards(html: string, pageUrl: string): ContainerEventBlock[] {
  const blocks: ContainerEventBlock[] = [];
  const headingRe = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const title = cleanTitle(match[1]!.replace(/<[^>]+>/g, ' '));
    if (isChromeTitle(title) || looksLikeEditorialContainerTitle(title)) continue;
    const window = html.slice(match.index, match.index + 900);
    const dateTime = window.match(
      /<time[^>]*datetime=["'](\d{4}-\d{2}-\d{2})(T[^"']*)?["'][^>]*>([\s\S]*?)<\/time>/i,
    );
    if (!dateTime) continue;
    const iso = dateTime[1]!;
    const timeText = decodeListingEntities(dateTime[3]!.replace(/<[^>]+>/g, ' '));
    const clock = clocksIn(window)[0] ?? (/\d{1,2}:\d{2}/.test(timeText) ? timeText : null);
    const startTime = clock ? normalizeClock(clock) : null;
    const venue = venueFromSuffix(
      window
        .replace(/<[^>]+>/g, ' ')
        .replace(title, ' ')
        .replace(timeText, ' '),
    );
    blocks.push({
      text: decodeListingEntities(window.replace(/<[^>]+>/g, ' ')).slice(0, 500),
      title,
      eventDate: startTime ? `${iso}T${startTime}` : iso,
      eventEndDate: null,
      startTime,
      venue,
      location: venue,
      sourceUrl: pageUrl,
      structured: true,
    });
  }
  return blocks;
}

function blockToOpportunity(block: ContainerEventBlock, parentUrl: string): ExtractedOpportunity | null {
  if (!block.title || !block.eventDate || !block.structured) return null;
  if (isChromeTitle(block.title)) return null;
  return {
    title: block.title,
    summary: block.text.slice(0, 280) || null,
    location: block.location,
    venue: block.venue,
    businessName: block.venue,
    eventDate: block.eventDate,
    eventEndDate: block.eventEndDate,
    category: 'local_event',
    sourceUrl: block.sourceUrl || parentUrl,
    tags: ['container_card'],
    confidence: 0.84,
    parentArticleUrl: parentUrl,
    startTime: block.startTime,
  };
}

function opportunityKey(opp: ExtractedOpportunity): string {
  const title = (opp.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const day = (opp.eventDate ?? '').slice(0, 10);
  const venue = (opp.venue ?? opp.location ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${title}|${day}|${venue}`;
}

export function finalizeContainerOpportunities(
  opportunities: ExtractedOpportunity[],
  parentTitle?: string | null,
): ExtractedOpportunity[] {
  const out: ExtractedOpportunity[] = [];
  const seen = new Set<string>();
  for (const opp of opportunities) {
    const title = opp.title?.trim() ?? '';
    if (!title) continue;
    if (titlesMatch(title, parentTitle)) continue;
    if (looksLikeEditorialContainerTitle(title) || isChromeTitle(title)) continue;
    if (!opp.eventDate?.trim()) continue;
    const key = opportunityKey(opp);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...opp,
      eventDate: opp.eventDate.includes('T00:00:00') && !opp.startTime ? opp.eventDate.slice(0, 10) : opp.eventDate,
    });
    if (out.length >= MAX_CHILDREN) break;
  }
  return out;
}

export function chunkContainerBlocks(blocks: ContainerEventBlock[], maxChars = CHUNK_CHARS): string[] {
  if (blocks.length === 0) return [];
  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    const piece = block.text.trim();
    if (!piece) continue;
    if (current && current.length + piece.length + 2 > maxChars) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function jsonLdToBlocks(html: string | null | undefined, pageUrl: string): ContainerEventBlock[] {
  if (!html?.trim()) return [];
  return parseJsonLdPageGraph(html).events.flatMap((ev) => {
    if (!ev.name?.trim() || !ev.startDate) return [];
    const venue = sanitizeVenue(ev.venue);
    const { eventDate, eventEndDate } = composeJsonLdOpportunityDates(ev);
    return [
      {
        text: [ev.name, ev.startDate, ev.startTime, ev.endTime, ev.venue].filter(Boolean).join(' '),
        title: decodeListingEntities(ev.name),
        eventDate: eventDate ?? ev.startDate,
        eventEndDate,
        startTime: ev.startTime,
        venue,
        location: ev.city ?? venue,
        sourceUrl: ev.url || pageUrl,
        structured: true,
      },
    ];
  });
}

function mergeContainerBlocks(groups: ContainerEventBlock[][], pageTitle?: string | null): ContainerEventBlock[] {
  const out: ContainerEventBlock[] = [];
  for (const group of groups) {
    for (const raw of group) {
      if (!raw.title || !raw.eventDate) continue;
      if (titlesMatch(raw.title, pageTitle)) continue;
      if (isChromeTitle(raw.title) || looksLikeEditorialContainerTitle(raw.title)) continue;
      const venue = sanitizeVenue(raw.venue);
      const block: ContainerEventBlock = {
        ...raw,
        venue,
        location: sanitizeVenue(raw.location) ?? venue,
      };
      const eventDate = block.eventDate!;
      const title = block.title!;
      const existing = out.find(
        (row) =>
          Boolean(row.eventDate) &&
          Boolean(row.title) &&
          row.eventDate!.slice(0, 10) === eventDate.slice(0, 10) &&
          titlesMatch(row.title, title),
      );
      if (!existing) {
        out.push(block);
        continue;
      }
      if (!existing.venue && block.venue) {
        existing.venue = block.venue;
        existing.location = block.location ?? block.venue;
      }
      if (block.title && existing.title && block.title.length < existing.title.length) {
        existing.title = block.title;
      }
      if (block.startTime) {
        existing.startTime = block.startTime;
        if (block.eventDate?.includes('T')) existing.eventDate = block.eventDate;
      }
    }
  }
  return out;
}

export function prepareContainerExtraction(input: {
  pageText: string;
  pageTitle?: string | null;
  pageUrl: string;
  pageHtml?: string | null;
}): ContainerExtractionPrep {
  const plainText = decodeListingEntities(input.pageText || '');
  const fromHtml = input.pageHtml?.trim() ? containerPageTextFromHtml(input.pageHtml) : '';
  const delimiterPlain = splitOnDelimiters(plainText);
  const delimiterHtml = splitOnDelimiters(fromHtml);
  const pageText =
    delimiterPlain.cards.length >= 2 && delimiterPlain.cards.length >= delimiterHtml.cards.length
      ? plainText
      : fromHtml || plainText;
  const delimiterSplit = splitOnDelimiters(pageText);
  const rawCards = delimiterSplit.cards.length >= 2 ? delimiterSplit.cards : splitOnDateAnchors(pageText);
  const jsonLdBlocks = jsonLdToBlocks(input.pageHtml, input.pageUrl);
  const parsed = [
    ...delimiterPlain.cards,
    ...delimiterHtml.cards,
    ...(delimiterSplit.cards.length >= 2 ? [] : rawCards),
  ]
    .map((card) => parseCard(card, input.pageUrl, input.pageTitle))
    .filter((block): block is ContainerEventBlock => block != null);
  const headingCards =
    jsonLdBlocks.length + parsed.length >= 2
      ? []
      : input.pageHtml
        ? extractHeadingTimeCards(input.pageHtml, input.pageUrl)
        : [];
  const blocksRaw = mergeContainerBlocks([jsonLdBlocks, parsed, headingCards], input.pageTitle);
  const tourPerformer = resolveTourPerformer({
    pageTitle: input.pageTitle,
    pageUrl: input.pageUrl,
    pageHtml: input.pageHtml,
  });
  const blocks = tourPerformer
    ? blocksRaw.map((block) => promoteVenueOnlyTourChild(block, tourPerformer))
    : blocksRaw;
  const shouldSplit = blocks.length >= 2;
  const structuredOpportunities = shouldSplit
    ? finalizeContainerOpportunities(
        blocks.map((block) => blockToOpportunity(block, input.pageUrl)).filter((opp): opp is ExtractedOpportunity => opp != null),
        input.pageTitle,
      )
    : [];

  const chunkSource = shouldSplit
    ? blocks
    : rawCards.length >= 2
      ? rawCards.map((text) => ({
          text,
          title: null,
          eventDate: null,
          eventEndDate: null,
          startTime: null,
          venue: null,
          location: null,
          sourceUrl: input.pageUrl,
          structured: false,
        }))
      : pageText
        ? [
            {
              text: pageText,
              title: null,
              eventDate: null,
              eventEndDate: null,
              startTime: null,
              venue: null,
              location: null,
              sourceUrl: input.pageUrl,
              structured: false,
            },
          ]
        : [];

  return {
    blocks,
    chunks: chunkContainerBlocks(chunkSource),
    structuredOpportunities,
    shouldSplit,
    usedDelimiters: delimiterSplit.used,
  };
}

export function extractEditorialContainerOpportunities(input: {
  pageText: string;
  pageTitle?: string | null;
  pageUrl: string;
  pageHtml?: string | null;
}): ExtractedOpportunity[] {
  return prepareContainerExtraction(input).structuredOpportunities;
}
