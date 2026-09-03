/**
 * Fact extraction from verified hospitality sources.
 *
 * Written against the actual markup of the actual pages, fetched and read on
 * 2026-09-03. Two findings shaped this module:
 *
 *   1. Crossroads Hotel's contact page obfuscates its email addresses with
 *      Cloudflare's `data-cfemail` scheme, so the plain HTML shows only
 *      "[email protected]". A naive extractor would have concluded the property
 *      publishes no media contact, when in fact `media@crossroadshotelkc.com` is
 *      right there under a label reading "Media". Decoding it is just reading the
 *      address the hotel published for this purpose.
 *   2. The canonical contact URL `/contact-2/` now 301-redirects to
 *      `/history-and-about/contact/`. Extraction records the URL it actually read.
 *
 * Everything here is pure: HTML in, facts out. No fetching, no database.
 */

/** Decodes one Cloudflare-obfuscated address. First byte is the XOR key. */
export function decodeCloudflareEmail(encoded: string): string | null {
  const hex = encoded.trim().toLowerCase();
  if (hex.length < 4 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return null;
  const key = Number.parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16) ^ key);
  }
  return out.includes('@') ? out : null;
}

/**
 * Replaces every Cloudflare-obfuscated address in a document with the real address, so
 * downstream text extraction sees what a human visitor sees.
 */
export function deobfuscateEmails(html: string): string {
  let out = html.replace(
    /<a\b[^>]*?\bdata-cfemail="([0-9a-fA-F]+)"[^>]*>.*?<\/a>/gis,
    (match, hex: string) => decodeCloudflareEmail(hex) ?? match,
  );
  out = out.replace(
    /<span\b[^>]*?\bdata-cfemail="([0-9a-fA-F]+)"[^>]*>.*?<\/span>/gis,
    (match, hex: string) => decodeCloudflareEmail(hex) ?? match,
  );
  out = out.replace(
    /\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+)/g,
    (match, hex: string) => {
      const decoded = decodeCloudflareEmail(hex);
      return decoded ? `mailto:${decoded}` : match;
    },
  );
  return out;
}

/** Readable text with scripts, styles and markup removed. */
export function htmlToText(html: string): string {
  const withEmails = deobfuscateEmails(html);
  const stripped = withEmails
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|article|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripped)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    rsquo: '\u2019',
    lsquo: '\u2018',
    ldquo: '\u201c',
    rdquo: '\u201d',
    mdash: '\u2014',
    ndash: '\u2013',
    hellip: '\u2026',
    eacute: '\u00e9',
  };
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => named[name.toLowerCase()] ?? match);
}

// ---------------------------------------------------------------- contacts

export type ExtractedContact = {
  email: string;
  /** The label published next to the address — "Media", "Sales", "House Keeping". */
  label: string | null;
  localPart: string;
};

/**
 * Pulls labelled email addresses off an official contact page.
 *
 * The label matters more than the address: a page that labels an address "Media" is
 * publishing a media inbox, which is a verified role inbox rather than a guess. An
 * unlabelled `info@` is a general inbox and must be classified as one.
 */
export function extractLabelledContacts(html: string): ExtractedContact[] {
  const text = htmlToText(html);
  const emails = new Map<string, ExtractedContact>();

  const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  let match: RegExpExecArray | null;
  while ((match = emailPattern.exec(text)) !== null) {
    const email = match[0].toLowerCase();
    if (emails.has(email)) continue;
    // The label is the word or two immediately before the address, which is how these
    // pages are laid out: "Email Media media@… Sales sales@…".
    const before = text.slice(Math.max(0, match.index - 60), match.index);
    const label = extractTrailingLabel(before);
    emails.set(email, {
      email,
      label,
      localPart: email.slice(0, email.indexOf('@')),
    });
  }

  return [...emails.values()];
}

const KNOWN_LABELS = [
  'media',
  'press',
  'public relations',
  'pr',
  'marketing',
  'partnerships',
  'partnership',
  'sales',
  'house keeping',
  'housekeeping',
  'events',
  'catering',
  'general',
  'reservations',
  'careers',
  'info',
];

function extractTrailingLabel(before: string): string | null {
  const cleaned = before.replace(/[:>\u2022|]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!cleaned) return null;
  for (const label of [...KNOWN_LABELS].sort((a, b) => b.length - a.length)) {
    if (cleaned.endsWith(label)) return label;
  }
  return null;
}

// ---------------------------------------------------------------- events

export type ExtractedEvent = {
  title: string;
  category: string | null;
  /** Exactly as published, e.g. "Sept 4th" or "Every Friday". Never reinterpreted. */
  dateText: string | null;
  timeText: string | null;
  excerpt: string | null;
  detailUrl: string | null;
  /** Resolved calendar date when the published text allows it. Null when it does not. */
  resolvedDate: string | null;
  /** True when the published text describes a recurring event rather than a single date. */
  recurring: boolean;
};

/**
 * Extracts events from the Crossroads Hotel events archive.
 *
 * The markup is a flat list of `<article class='event-card'>` blocks with a title, a
 * "Date:" line, a "Time:" line, an excerpt and a details link.
 */
export function extractCrossroadsEvents(html: string, now = new Date()): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const cardPattern = /<article[^>]*class=['"][^'"]*event-card[^'"]*['"][\s\S]*?<\/article>/gi;
  const cards = html.match(cardPattern) ?? [];

  for (const card of cards) {
    const title = firstGroup(card, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!title) continue;
    const category = firstGroup(card, /class=['"]event-category['"][^>]*>([\s\S]*?)<\//i);
    const dateText = firstGroup(card, /<b>\s*Date:\s*<\/b>\s*([\s\S]*?)<\//i);
    const timeText = firstGroup(card, /<b>\s*Time:\s*<\/b>\s*([\s\S]*?)<\//i);
    const excerpt = firstGroup(card, /class=['"]event-excerpt['"][^>]*>([\s\S]*?)<\//i);
    const detailUrl = firstGroup(card, /href=['"](https?:\/\/[^'"]*\/events\/[^'"]*)['"]/i);

    // A recurring event still has a specific next occurrence, and that date is what
    // makes a pitch concrete ("this Friday the 4th" rather than "some Friday"). Both
    // the date and the recurrence are kept.
    events.push({
      title,
      category,
      dateText,
      timeText,
      excerpt,
      detailUrl,
      resolvedDate: resolvePublishedDate(dateText, now),
      recurring: isRecurring(dateText, excerpt),
    });
  }

  return events;
}

/**
 * Extracts events from a page built with The Events Calendar ("Tribe"), the WordPress
 * plugin the Raphael Hotel uses. Worth handling properly rather than as a special case:
 * it is the most common events plugin on hotel and restaurant sites, and unlike
 * hand-rolled markup it publishes a machine-readable `datetime` attribute, so no date
 * guessing is needed at all.
 */
export function extractTribeEvents(html: string): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const cardPattern =
    /<article[^>]*class=["'][^"']*tribe-events-calendar-list__event\b[\s\S]*?<\/article>/gi;
  const cards = html.match(cardPattern) ?? [];

  for (const card of cards) {
    const title = firstGroup(
      card,
      /class=["'][^"']*tribe-events-calendar-list__event-title-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!title) continue;

    const isoDateAttr = card.match(
      /<time[^>]*class=["'][^"']*tribe-events-calendar-list__event-datetime[^"']*["'][^>]*datetime=["']([\d-]+)["']/i,
    )?.[1];
    const startText = firstGroup(card, /class=["']tribe-event-date-start["'][^>]*>([\s\S]*?)<\//i);
    const endText = firstGroup(card, /class=["']tribe-event-time["'][^>]*>([\s\S]*?)<\//i);
    const venue = firstGroup(
      card,
      /class=["'][^"']*tribe-events-calendar-list__event-venue-title[^"']*["'][^>]*>([\s\S]*?)<\//i,
    );
    const description = firstGroup(
      card,
      /class=["'][^"']*tribe-events-calendar-list__event-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    );
    const detailUrl = card.match(
      /class=["'][^"']*tribe-events-calendar-list__event-title-link[^"']*["'][^>]*href=["']([^"']+)["']/i,
    )?.[1] ?? card.match(/href=["'](https?:\/\/[^"']*\/event-calendar\/[^"']+)["']/i)?.[1] ?? null;

    // The published date attribute is authoritative — no inference required.
    const resolvedDate = isoDateAttr && /^\d{4}-\d{2}-\d{2}$/.test(isoDateAttr) ? isoDateAttr : null;

    events.push({
      title,
      // Tribe stores the venue rather than a category; for a hotel the venue is the
      // outlet inside the property, which is exactly the useful detail.
      category: venue,
      dateText: startText,
      timeText: endText ? `${startText ?? ''} - ${endText}`.trim() : startText,
      excerpt: description,
      detailUrl,
      resolvedDate,
      recurring: isRecurring(startText, description),
    });
  }

  return events;
}

function firstGroup(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern);
  if (!match?.[1]) return null;
  const text = htmlToText(match[1]).trim();
  return text || null;
}

function isRecurring(dateText: string | null, excerpt: string | null): boolean {
  const haystack = `${dateText ?? ''} ${excerpt ?? ''}`.toLowerCase();
  return /\b(every|weekly|monthly|each)\s+(friday|saturday|sunday|monday|tuesday|wednesday|thursday|week|month)\b/.test(
    haystack,
  );
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Resolves a published date like "Sept 4th" to a calendar date.
 *
 * The pages omit the year, so the year is inferred as the nearest upcoming occurrence.
 * A date more than a month in the past is read as next year rather than as an event
 * that already happened, because these are forward-looking listings. When the text
 * cannot be resolved confidently this returns null — an unresolved date is honest, and
 * a wrong date would put a stale "why now" in front of a hotel.
 */
export function resolvePublishedDate(dateText: string | null, now = new Date()): string | null {
  if (!dateText) return null;
  const text = dateText.trim().toLowerCase();

  // An explicit year is authoritative.
  const explicit = text.match(/([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (explicit) {
    const month = MONTHS[explicit[1]!];
    if (month === undefined) return null;
    return isoDate(Number(explicit[3]), month, Number(explicit[2]));
  }

  const match = text.match(/([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?/);
  if (!match) return null;
  const month = MONTHS[match[1]!];
  if (month === undefined) return null;
  const day = Number(match[2]);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;

  const year = now.getUTCFullYear();
  const candidate = Date.UTC(year, month, day);
  const monthAgo = now.getTime() - 31 * 86_400_000;
  if (candidate < monthAgo) return isoDate(year + 1, month, day);
  return isoDate(year, month, day);
}

function isoDate(year: number, monthIndex: number, day: number): string {
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Events that are still ahead of us, which are the only ones that can justify reaching
 * out. A recurring event is always current. This is the guard against the live bug
 * where a 58-day-old draft described a moment that had already passed.
 */
export function upcomingEvents(events: ExtractedEvent[], now = new Date()): ExtractedEvent[] {
  const today = now.toISOString().slice(0, 10);
  return events.filter((e) => e.recurring || (e.resolvedDate !== null && e.resolvedDate >= today));
}
