/**
 * OPCC (opconventioncenter.com) detail-page visible Time precedence.
 *
 * Modern Events Calendar detail pages expose a human-visible
 * `.mec-single-event-time` clock that is authoritative when it disagrees
 * with JSON-LD wall times. Scoped to OPCC event detail URLs only.
 */
import type { ExtractedOpportunity } from './listing-extract.js';
import { isTrustworthyListingClock } from './jsonld-events.js';
import { normalizeListingClock } from './listing-showtime.js';

const OPCC_HOST_RE = /(^|\.)opconventioncenter\.com$/i;
const DETAIL_PATH_RE = /^\/events\/[^/]+\/?$/i;
const LISTING_PATH_RE = /^\/events\/?$/i;

const MEC_TIME_BLOCK_RE =
  /<div[^>]*\bclass=["'][^"']*\bmec-single-event-time\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i;
const MEC_ABBR_RE = /<abbr[^>]*\bclass=["'][^"']*\bmec-events-abbr\b[^"']*["'][^>]*>([\s\S]*?)<\/abbr>/i;
const MEC_TIME_TEXT_RE =
  /\bTime\s+(\d{1,2}:\d{2}\s*[ap]\.?m\.?(?:\s*[-–—]\s*\d{1,2}:\d{2}\s*[ap]\.?m\.?)?)\b/i;
const RANGE_RE =
  /^(\d{1,2}:\d{2}\s*[ap]\.?m\.?)\s*[-–—]\s*(\d{1,2}:\d{2}\s*[ap]\.?m\.?)$/i;
const START_ONLY_RE = /^(\d{1,2}:\d{2}\s*[ap]\.?m\.?)$/i;

export type OpccVisibleTime = {
  startTime: string;
  endTime: string | null;
  raw: string;
};

export function isOpccEventDetailUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (!OPCC_HOST_RE.test(parsed.hostname)) return false;
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (LISTING_PATH_RE.test(path) || path === '/events') return false;
    return DETAIL_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateKey(raw: string | null | undefined): string | null {
  const slice = (raw ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function parseVisibleClockRange(raw: string): OpccVisibleTime | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const range = text.match(RANGE_RE);
  if (range) {
    const startTime = normalizeListingClock(range[1]!);
    const endTime = normalizeListingClock(range[2]!);
    if (!startTime || !isTrustworthyListingClock(startTime)) return null;
    if (!endTime || !isTrustworthyListingClock(endTime)) {
      return { startTime, endTime: null, raw: text };
    }
    // Same-day only; do not invent overnight when visible end is earlier.
    if (endTime < startTime) return { startTime, endTime: null, raw: text };
    return { startTime, endTime, raw: text };
  }

  const startOnly = text.match(START_ONLY_RE);
  if (startOnly) {
    const startTime = normalizeListingClock(startOnly[1]!);
    if (!startTime || !isTrustworthyListingClock(startTime)) return null;
    return { startTime, endTime: null, raw: text };
  }

  return null;
}

/** Prefer structured MEC Time block; fall back to labeled Time text. */
export function parseOpccDetailVisibleTime(
  htmlOrText: string | null | undefined,
): OpccVisibleTime | null {
  if (!htmlOrText?.trim()) return null;

  const block = htmlOrText.match(MEC_TIME_BLOCK_RE)?.[0];
  if (block) {
    const abbr = block.match(MEC_ABBR_RE)?.[1];
    if (abbr) {
      const parsed = parseVisibleClockRange(stripTags(abbr));
      if (parsed) return parsed;
    }
  }

  const labeled = htmlOrText.match(MEC_TIME_TEXT_RE)?.[1];
  if (labeled) return parseVisibleClockRange(labeled);

  return null;
}

/**
 * When OPCC detail HTML exposes a clear visible Time, override JSON-LD clocks
 * on that opportunity. Preserves event calendar date. Does not invent ends.
 */
export function overlayOpccDetailVisibleTime(
  opp: ExtractedOpportunity,
  evidence: {
    html?: string | null;
    text?: string | null;
    pageUrl?: string | null;
  },
): ExtractedOpportunity {
  const pageUrl = evidence.pageUrl ?? opp.sourceUrl ?? null;
  if (!isOpccEventDetailUrl(pageUrl)) return opp;

  const visible = parseOpccDetailVisibleTime(evidence.html) ?? parseOpccDetailVisibleTime(evidence.text);
  if (!visible) return opp;

  const date = dateKey(opp.eventDate);
  if (!date) return opp;

  const startTime = visible.startTime;
  const eventDate = `${date}T${startTime}`;

  if (!visible.endTime) {
    return {
      ...opp,
      startTime,
      eventDate,
      // Keep existing end evidence; do not invent an end from start-only HTML.
    };
  }

  return {
    ...opp,
    startTime,
    eventDate,
    eventEndDate: `${date}T${visible.endTime}`,
  };
}
