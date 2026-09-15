/**
 * General SSR HTML event-calendar reader.
 *
 * Recognizes conventional server-rendered calendars that group cards under
 * full-date headings (e.g. "Tuesday, September 15, 2026") with shorter
 * month/day labels on each card. No publisher-domain hard-coding and no
 * VisitKC-specific selectors — structural date headings + repeated title
 * links + neighboring venue/category cues only.
 */

import { createHash } from 'node:crypto';
import { stripTrackingParams } from './event-listing-outcomes.js';
import type { ExtractedEventListing, EventListingExtractionMethod } from './event-listing-extract.js';

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const WEEKDAY =
  '(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat)';
const MONTH =
  '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

const FULL_DATE_RE = new RegExp(
  `\\b(?:${WEEKDAY})[,.]?\\s+(${MONTH})\\.?(?:\\s+|-)(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(\\d{4})\\b`,
  'i',
);
const FULL_DATE_NO_WEEKDAY_RE = new RegExp(
  `\\b(${MONTH})\\.?(?:\\s+|-)(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(\\d{4})\\b`,
  'i',
);
const SHORT_DATE_RE = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/i;

const HEADING_DATE_RE = new RegExp(
  `<h([1-4])\\b[^>]*>\\s*([\\s\\S]*?)\\s*</h\\1>`,
  'gi',
);

export type HtmlCalendarPagination = {
  currentPage: number | null;
  totalPages: number | null;
  totalResults: number | null;
  nextPageUrl: string | null;
  pageUrls: string[];
  numberedPagesDetected: number[];
  hasNext: boolean;
  strategy: string | null;
};

export type HtmlCalendarExtractResult = {
  events: ExtractedEventListing[];
  method: EventListingExtractionMethod | 'none';
  rejectionReasons: string[];
  dateHeadingCount: number;
  cardCandidateCount: number;
  pagination: HtmlCalendarPagination;
  evidence: string[];
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTagsKeepText(html: string): string {
  return decodeEntities(html);
}

function absUrl(href: string | null | undefined, pageUrl: string): string | null {
  if (!href?.trim()) return null;
  try {
    const u = new URL(href.trim(), pageUrl);
    u.hash = '';
    return stripTrackingParams(u.href);
  } catch {
    return null;
  }
}

function ymd(year: number, month: number, day: number): string | null {
  if (!year || !month || !day || day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseFullCalendarDate(raw: string): string | null {
  const text = stripTagsKeepText(raw);
  const withWeekday = text.match(FULL_DATE_RE);
  if (withWeekday) {
    const month = MONTHS[withWeekday[1]!.toLowerCase()];
    return ymd(Number(withWeekday[3]), month ?? 0, Number(withWeekday[2]));
  }
  const plain = text.match(FULL_DATE_NO_WEEKDAY_RE);
  if (plain) {
    const month = MONTHS[plain[1]!.toLowerCase()];
    return ymd(Number(plain[3]), month ?? 0, Number(plain[2]));
  }
  return null;
}

export function parseShortCalendarDate(raw: string, year: number): string | null {
  const text = stripTagsKeepText(raw);
  // Prefer short month/day without year; ignore if the chunk is itself a full date.
  if (parseFullCalendarDate(text)) return parseFullCalendarDate(text);
  const m = text.match(SHORT_DATE_RE);
  if (!m) return null;
  const month = MONTHS[m[1]!.toLowerCase()];
  return ymd(year, month ?? 0, Number(m[2]));
}

function parseClockToHms(text: string): string | null {
  const m = text.match(TIME_RE);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ap = m[3]!.toLowerCase();
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function looksLikeEventDetailPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (/\/events?\/(?:type|category|tag|page|this-weekend|annual|search|submit)(?:\/|$)/i.test(path)) {
    return false;
  }
  if (/\/listings?\//i.test(path)) return false;
  if (/\/(?:page)\/\d+/i.test(path)) return false;
  // /events/<slug> or /event/<slug> or /calendar/<slug>
  if (/\/events?\/[^/]+$/i.test(path)) return true;
  if (/\/calendar\/[^/]+$/i.test(path)) return true;
  if (/\/shows?\/[^/]+$/i.test(path)) return true;
  return false;
}

function isCategoryPath(pathname: string): boolean {
  return /\/(?:events?\/)?(?:type|category|categories|tag|topics?)(?:\/|$)/i.test(pathname);
}

function isVenueListingPath(pathname: string): boolean {
  return /\/listings?\//i.test(pathname) || /\/venues?\//i.test(pathname);
}

function fingerprint(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

/**
 * Detect SSR calendars that group listings under full-date headings.
 * Structural only — no domain checks.
 */
export function htmlLooksLikeDateGroupedCalendar(html: string): boolean {
  const headings = [...html.matchAll(HEADING_DATE_RE)]
    .map((m) => stripTagsKeepText(m[2] ?? ''))
    .filter((t) => isDateOnlyHeading(t));
  if (headings.length < 1) return false;
  // Need repeated title links that look like event details.
  let detailLinks = 0;
  for (const m of html.matchAll(/<a\b[^>]+href=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const path = new URL(m[1]!, 'https://example.invalid').pathname;
      if (looksLikeEventDetailPath(path)) detailLinks += 1;
    } catch {
      /* ignore */
    }
  }
  return detailLinks >= 2;
}

type DateHeading = {
  index: number;
  end: number;
  text: string;
  date: string;
  year: number;
};

function isDateOnlyHeading(text: string): boolean {
  const date = parseFullCalendarDate(text);
  if (!date) return false;
  // Reject event titles that merely embed a date ("… Dec. 13, 2026").
  const stripped = text
    .replace(FULL_DATE_RE, ' ')
    .replace(FULL_DATE_NO_WEEKDAY_RE, ' ')
    .replace(/[,\-–—|/.:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length === 0) return true;
  // Allow trivial leftovers like "All day" / timezone abbreviations.
  if (/^(all\s*day|edt|cdt|cst|est|pst|pdt|mdt|mst)$/i.test(stripped)) return true;
  return false;
}

function findDateHeadings(html: string): DateHeading[] {
  const out: DateHeading[] = [];
  for (const m of html.matchAll(HEADING_DATE_RE)) {
    const inner = m[2] ?? '';
    const text = stripTagsKeepText(inner);
    if (!isDateOnlyHeading(text)) continue;
    const date = parseFullCalendarDate(text);
    if (!date) continue;
    if (/^(featured|search|submit|filter|related|upcoming events|this weekend)\b/i.test(text)) {
      continue;
    }
    out.push({
      index: m.index ?? 0,
      end: (m.index ?? 0) + m[0]!.length,
      text,
      date,
      year: Number(date.slice(0, 4)),
    });
  }
  return out.sort((a, b) => a.index - b.index);
}

type TitleHit = {
  index: number;
  end: number;
  title: string;
  href: string;
  tag: string;
};

function findTitleHits(sectionHtml: string, sectionOffset: number, pageUrl: string): TitleHit[] {
  const hits: TitleHit[] = [];
  // Prefer headings that wrap a single event detail link.
  const headingLinkRe =
    /<h([2-4])\b[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h\1>/gi;
  for (const m of sectionHtml.matchAll(headingLinkRe)) {
    const href = absUrl(m[2], pageUrl);
    if (!href) continue;
    let path = '';
    try {
      path = new URL(href).pathname;
    } catch {
      continue;
    }
    if (!looksLikeEventDetailPath(path)) continue;
    const title = stripTagsKeepText(m[3] ?? '');
    if (title.length < 3 || title.length > 220) continue;
    if (/^(read more|learn more|details|tickets?|register|rsvp)$/i.test(title)) continue;
    hits.push({
      index: sectionOffset + (m.index ?? 0),
      end: sectionOffset + (m.index ?? 0) + m[0]!.length,
      title,
      href,
      tag: `h${m[1]}`,
    });
  }

  // Fallback: standalone anchors that look like event detail titles (when not already captured).
  if (hits.length === 0) {
    for (const m of sectionHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = absUrl(m[1], pageUrl);
      if (!href) continue;
      let path = '';
      try {
        path = new URL(href).pathname;
      } catch {
        continue;
      }
      if (!looksLikeEventDetailPath(path)) continue;
      const title = stripTagsKeepText(m[2] ?? '');
      if (title.length < 8 || title.length > 220) continue;
      if (/^(read more|learn more|details|tickets?|register|rsvp|next|previous)$/i.test(title)) {
        continue;
      }
      hits.push({
        index: sectionOffset + (m.index ?? 0),
        end: sectionOffset + (m.index ?? 0) + m[0]!.length,
        title,
        href,
        tag: 'a',
      });
    }
  }

  // De-dupe overlapping identical href+title near same index.
  const seen = new Set<string>();
  const unique: TitleHit[] = [];
  for (const hit of hits.sort((a, b) => a.index - b.index)) {
    const key = `${hit.href.toLowerCase()}|${hit.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}

function cardWindow(
  html: string,
  hit: TitleHit,
  prevEnd: number | null,
  nextIndex: number | null,
): string {
  // Bound tightly to the card: after the previous title (or a short lookback) through
  // the next title — prevents venue/image bleed from neighboring cards.
  const start = Math.max(prevEnd ?? 0, hit.index - 700);
  const end = Math.min(html.length, nextIndex ?? hit.end + 700);
  return html.slice(start, end);
}

function extractImageUrl(card: string, pageUrl: string): string | null {
  const candidates: string[] = [];
  for (const m of card.matchAll(
    /<img\b[^>]*(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["'][^>]*>/gi,
  )) {
    const raw = m[1]!;
    if (/^data:/i.test(raw)) continue;
    if (/logo\.(svg|png|webp|jpe?g)|sprite|icon|avatar|placeholder/i.test(raw)) continue;
    const abs = absUrl(raw, pageUrl);
    if (abs) candidates.push(abs);
  }
  return candidates[0] ?? null;
}

function extractCategory(card: string, pageUrl: string): string | null {
  for (const m of card.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = absUrl(m[1], pageUrl);
    if (!href) continue;
    try {
      if (!isCategoryPath(new URL(href).pathname)) continue;
    } catch {
      continue;
    }
    const label = stripTagsKeepText(m[2] ?? '');
    if (label && label.length < 60) return label;
  }
  return null;
}

function extractVenue(card: string, pageUrl: string, titleHref: string): string | null {
  // Prefer venue links that appear AFTER the title link in the card window.
  const titlePos = card.toLowerCase().indexOf(titleHref.toLowerCase());
  const afterTitle = titlePos >= 0 ? card.slice(titlePos) : card;
  const candidates: Array<{ text: string; score: number }> = [];
  for (const m of afterTitle.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = absUrl(m[1], pageUrl);
    if (!href || href === titleHref) continue;
    let path = '';
    try {
      path = new URL(href).pathname;
    } catch {
      continue;
    }
    if (looksLikeEventDetailPath(path) || isCategoryPath(path)) continue;
    const text = stripTagsKeepText(m[2] ?? '');
    if (!text || text.length < 2 || text.length > 120) continue;
    let score = 1;
    if (isVenueListingPath(path)) score += 5;
    if (/venue|location|place|theater|theatre|museum|park|library|district|hall|center|centre/i.test(path + text)) {
      score += 2;
    }
    candidates.push({ text, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0] && candidates[0].score >= 3) return candidates[0].text;

  // Plain-text venue line in a trailing paragraph (common SSR pattern).
  const para = afterTitle.match(
    /<p\b[^>]*>([\s\S]*?)<\/p>/i,
  );
  if (para) {
    const text = stripTagsKeepText(para[1] ?? '');
    if (
      text &&
      text.length >= 2 &&
      text.length <= 100 &&
      !/^(occurs|recurring|free|tickets?|learn more)/i.test(text) &&
      !TIME_RE.test(text)
    ) {
      return text;
    }
  }

  const plain = stripTagsKeepText(afterTitle);
  const venueLine = plain.match(
    /(?:Venue|Location|Where)\s*[:\-–]\s*([A-Z][^.]{2,80})/i,
  );
  return venueLine?.[1]?.trim() ?? null;
}

function extractShortDateFromCard(card: string, inheritedYear: number): string | null {
  // Prefer compact date chips near the top of the card body.
  const chip = card.match(
    /<(?:div|span|time|p)\b[^>]{0,160}>([^<]{0,40}?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}[^<]{0,20})<\/(?:div|span|time|p)>/i,
  );
  if (chip?.[1]) {
    const parsed = parseShortCalendarDate(chip[1], inheritedYear);
    if (parsed) return parsed;
  }
  return parseShortCalendarDate(card.slice(0, 1800), inheritedYear);
}

function isRecurringCard(card: string): boolean {
  return /occurs\s+(weekly|daily|monthly|annually)|recurring\s+event|repeats?\b/i.test(card);
}

export function discoverHtmlCalendarPagination(
  html: string,
  pageUrl: string,
): HtmlCalendarPagination {
  const pageUrls: string[] = [];
  const numbered = new Set<number>();
  let currentPage: number | null = null;
  let totalPages: number | null = null;
  let totalResults: number | null = null;
  let nextPageUrl: string | null = null;
  let strategy: string | null = null;

  const base = (() => {
    try {
      return new URL(pageUrl);
    } catch {
      return null;
    }
  })();

  const pagePathMatch = pageUrl.match(/\/page\/(\d+)\/?/i);
  if (pagePathMatch) currentPage = Number(pagePathMatch[1]);

  for (const m of html.matchAll(/href=["']([^"']*\/page\/(\d+)\/?)["']/gi)) {
    const abs = absUrl(m[1], pageUrl);
    const n = Number(m[2]);
    if (!abs || !n) continue;
    numbered.add(n);
    if (!pageUrls.includes(abs)) pageUrls.push(abs);
  }

  // JS-driven numbered controls that still map to conventional /page/N/ URLs.
  for (const m of html.matchAll(/\bdata-pg=["'](\d+)["']/gi)) {
    const n = Number(m[1]);
    if (!n || !base) continue;
    numbered.add(n);
    const u = new URL(pageUrl);
    // Strip existing /page/N/
    u.pathname = u.pathname.replace(/\/page\/\d+\/?/i, '/').replace(/\/?$/, '/');
    if (n > 1) u.pathname = `${u.pathname.replace(/\/?$/, '/')}page/${n}/`;
    const abs = stripTrackingParams(u.href);
    if (!pageUrls.includes(abs)) pageUrls.push(abs);
  }

  const ofPages = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  if (ofPages) {
    currentPage = currentPage ?? Number(ofPages[1]);
    totalPages = Number(ofPages[2]);
    strategy = strategy ?? 'page_x_of_y';
  }

  const results =
    html.match(/>([\d,]+)<\/(?:span|strong|b|em|i)>\s*results?\s+found/i) ||
    html.match(/([\d,]+)\s+results?\s+found/i) ||
    html.match(/([\d,]+)\s+events?\s+found/i);
  if (results) totalResults = Number(results[1]!.replace(/,/g, ''));

  const relNext = html.match(
    /<link[^>]+rel=["']next["'][^>]*href=["']([^"']+)["']|<a[^>]+rel=["']next["'][^>]*href=["']([^"']+)["']/i,
  );
  if (relNext) {
    nextPageUrl = absUrl(relNext[1] || relNext[2], pageUrl);
    strategy = strategy ?? 'rel_next';
  }

  if (!nextPageUrl && base) {
    const cur = currentPage ?? 1;
    const candidate = pageUrls.find((u) => {
      const m = u.match(/\/page\/(\d+)\/?/i);
      return m && Number(m[1]) === cur + 1;
    });
    if (candidate) {
      nextPageUrl = candidate;
      strategy = strategy ?? 'numbered_page_href';
    } else if (numbered.has(cur + 1) || (totalPages != null && cur < totalPages)) {
      const u = new URL(pageUrl);
      u.pathname = u.pathname.replace(/\/page\/\d+\/?/i, '/').replace(/\/?$/, '/');
      u.pathname = `${u.pathname}page/${cur + 1}/`;
      nextPageUrl = stripTrackingParams(u.href);
      strategy = strategy ?? 'constructed_page_n';
    }
  }

  if (pageUrls.length || nextPageUrl) strategy = strategy ?? 'numbered_or_next';

  const hasNext = Boolean(nextPageUrl) || (totalPages != null && (currentPage ?? 1) < totalPages);

  return {
    currentPage: currentPage ?? (hasNext || pageUrls.length ? 1 : null),
    totalPages,
    totalResults,
    nextPageUrl,
    pageUrls: pageUrls.sort((a, b) => {
      const na = Number(a.match(/\/page\/(\d+)/i)?.[1] ?? 0);
      const nb = Number(b.match(/\/page\/(\d+)/i)?.[1] ?? 0);
      return na - nb;
    }),
    numberedPagesDetected: [...numbered].sort((a, b) => a - b),
    hasNext,
    strategy,
  };
}

/**
 * Build the next N page URLs to fetch for a date-grouped calendar collection.
 * Never includes the configured collection URL itself. Caps prevent loops.
 */
export function planHtmlCalendarPageFetches(input: {
  collectionUrl: string;
  html: string;
  maxPages: number;
}): { pages: string[]; pagination: HtmlCalendarPagination } {
  const pagination = discoverHtmlCalendarPagination(input.html, input.collectionUrl);
  const pages: string[] = [];
  const seen = new Set<string>([input.collectionUrl.replace(/\/$/, ''), stripTrackingParams(input.collectionUrl).replace(/\/$/, '')]);
  const max = Math.max(1, input.maxPages);

  const push = (url: string | null) => {
    if (!url) return;
    const key = stripTrackingParams(url).replace(/\/$/, '');
    if (seen.has(key)) return;
    // Stay under same origin + same collection path family.
    try {
      const base = new URL(input.collectionUrl);
      const u = new URL(url);
      if (u.origin !== base.origin) return;
      if (!/\/page\/\d+\/?/i.test(u.pathname) && u.pathname.replace(/\/$/, '') !== base.pathname.replace(/\/$/, '')) {
        return;
      }
    } catch {
      return;
    }
    seen.add(key);
    pages.push(stripTrackingParams(url));
  };

  // Prefer sequential numbered pages starting at 2.
  const startPage = pagination.currentPage && pagination.currentPage > 1 ? pagination.currentPage + 1 : 2;
  const lastKnown =
    pagination.totalPages ??
    (pagination.numberedPagesDetected.length
      ? Math.max(...pagination.numberedPagesDetected)
      : startPage + max);

  for (let n = startPage; n <= lastKnown && pages.length < max - 1; n += 1) {
    const fromList = pagination.pageUrls.find((u) => Number(u.match(/\/page\/(\d+)/i)?.[1]) === n);
    if (fromList) {
      push(fromList);
      continue;
    }
    try {
      const u = new URL(input.collectionUrl);
      u.pathname = u.pathname.replace(/\/page\/\d+\/?/i, '/').replace(/\/?$/, '/');
      u.pathname = `${u.pathname}page/${n}/`;
      push(u.href);
    } catch {
      break;
    }
  }

  if (pages.length === 0 && pagination.nextPageUrl) push(pagination.nextPageUrl);

  return { pages: pages.slice(0, Math.max(0, max - 1)), pagination };
}

export function extractHtmlCalendarListings(input: {
  html: string;
  pageUrl: string;
  now?: Date;
  configuredUrl?: string | null;
}): HtmlCalendarExtractResult {
  const html = input.html;
  const pageUrl = input.pageUrl;
  const configuredUrl = input.configuredUrl ?? pageUrl;
  const rejectionReasons: string[] = [];
  const evidence: string[] = [];
  const pagination = discoverHtmlCalendarPagination(html, pageUrl);
  const headings = findDateHeadings(html);

  if (headings.length === 0) {
    rejectionReasons.push('html_calendar:no_full_date_headings');
    return {
      events: [],
      method: 'none',
      rejectionReasons,
      dateHeadingCount: 0,
      cardCandidateCount: 0,
      pagination,
      evidence,
    };
  }

  evidence.push(`date_headings:${headings.length}`);
  if (pagination.totalResults != null) evidence.push(`result_count:${pagination.totalResults}`);
  if (pagination.totalPages != null) evidence.push(`total_pages:${pagination.totalPages}`);
  if (pagination.strategy) evidence.push(`pagination:${pagination.strategy}`);

  const events: ExtractedEventListing[] = [];
  let cardCandidateCount = 0;

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i]!;
    const sectionStart = heading.end;
    const sectionEnd = i + 1 < headings.length ? headings[i + 1]!.index : html.length;
    // Stop before obvious pagination chrome when it appears after the last date group.
    const sectionHtmlRaw = html.slice(sectionStart, sectionEnd);
    const pagIdx = sectionHtmlRaw.search(/class=["'][^"']*pagination|js-pagination|aria-label=["']Listing pagination/i);
    const sectionHtml = pagIdx > 0 ? sectionHtmlRaw.slice(0, pagIdx) : sectionHtmlRaw;
    const titleHits = findTitleHits(sectionHtml, sectionStart, pageUrl);
    cardCandidateCount += titleHits.length;

    for (let t = 0; t < titleHits.length; t += 1) {
      const hit = titleHits[t]!;
      const prevEnd = t > 0 ? titleHits[t - 1]!.end : sectionStart;
      const nextHitIndex = t + 1 < titleHits.length ? titleHits[t + 1]!.index : sectionEnd;
      const card = cardWindow(html, hit, prevEnd, nextHitIndex);
      const shortDate = extractShortDateFromCard(card, heading.year);
      // Prefer inherited date-heading context; accept short date when it matches month/day.
      let startDate = heading.date;
      if (shortDate) {
        if (shortDate === heading.date) {
          startDate = heading.date;
        } else if (shortDate.slice(5) === heading.date.slice(5)) {
          startDate = heading.date;
        } else {
          // Card short date disagrees with heading — keep heading (grouping is authoritative).
          startDate = heading.date;
        }
      }

      const startTime = parseClockToHms(card);
      const venue = extractVenue(card, pageUrl, hit.href);
      const category = extractCategory(card, pageUrl);
      const imageUrl = extractImageUrl(card, pageUrl);
      const recurring = isRecurringCard(card);
      const externalId = fingerprint([
        hit.title.toLowerCase(),
        startDate,
        (venue ?? '').toLowerCase(),
        hit.href.toLowerCase(),
      ]);

      const rowEvidence = [
        'html_calendar_date_heading',
        `heading:${heading.text}`,
        `start:${startDate}`,
        shortDate ? `card_short_date:${shortDate}` : 'card_short_date:missing',
        startTime ? `start_time:${startTime}` : 'start_time:unpublished',
        venue ? `venue:${venue}` : 'venue:missing',
        category ? `category:${category}` : 'category:missing',
        imageUrl ? 'image:present' : 'image:missing',
        recurring ? 'recurring:indicated' : 'recurring:false',
        `detail_url:${hit.href}`,
        `collection_url:${configuredUrl}`,
      ];

      const row: ExtractedEventListing = {
        externalId: `htmlcal:${externalId}`,
        title: hit.title,
        startDate,
        startDateTime: startTime ? `${startDate}T${startTime}` : null,
        endDate: null,
        endDateTime: null,
        venue,
        address: null,
        city: null,
        regionState: null,
        priceText: null,
        isFree: category ? /free/i.test(category) : null,
        eventUrl: hit.href,
        ticketOrRsvpUrl: hit.href,
        organizer: null,
        isRecurring: recurring,
        imageUrl,
        sourceUrl: pageUrl,
        evidence: rowEvidence,
        method: 'semantic_html_blocks',
        verificationState: 'verified',
        platform: 'generic_semantic_html',
        startTimeLocal: startTime ? startTime.slice(0, 5) : null,
        configuredUrl,
        effectiveExtractionUrl: pageUrl,
        itemKind: 'event',
      };
      // Attach category in evidence only (no dedicated field on listing type).
      void category;
      events.push(row);
    }
  }

  // Dedupe identical occurrences (same title+venue+start+url) while keeping
  // legitimate recurring appearances on different inherited dates.
  const seen = new Set<string>();
  const deduped: ExtractedEventListing[] = [];
  for (const ev of events) {
    const key = [
      (ev.title ?? '').trim().toLowerCase(),
      (ev.venue ?? '').trim().toLowerCase(),
      ev.startDate ?? '',
      (ev.eventUrl ?? '').trim().toLowerCase(),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ev);
  }

  if (deduped.length === 0) {
    rejectionReasons.push('html_calendar:date_headings_without_cards');
  } else {
    evidence.push(`occurrences:${deduped.length}`);
  }

  return {
    events: deduped,
    method: deduped.length > 0 ? 'semantic_html_blocks' : 'none',
    rejectionReasons,
    dateHeadingCount: headings.length,
    cardCandidateCount,
    pagination,
    evidence,
  };
}
