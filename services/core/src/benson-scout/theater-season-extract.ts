/**
 * Theater season page → production / performance hierarchy (KC Melting Pot pattern).
 * Default timezone America/Chicago. Never invent missing curtain times.
 */

import type { ExtractedEventListing } from './event-listing-extract.js';

export const THEATER_SEASON_TIME_ZONE = 'America/Chicago';

export type TheaterSeasonPerformance = {
  externalId: string;
  title: string;
  startDate: string;
  startDateTime: string;
  endDate: string | null;
  endDateTime: string | null;
  venue: string | null;
  eventUrl: string | null;
  ticketOrRsvpUrl: string | null;
  evidence: string[];
  productionTitle: string;
  productionId: string;
  productionGroupKey: string;
  listingRole: 'performance';
  performanceLabel: string;
  runStartDate: string | null;
  runEndDate: string | null;
};

export type TheaterSeasonProduction = {
  title: string;
  productionTitle: string;
  productionId: string;
  productionGroupKey: string;
  runStartDate: string | null;
  runEndDate: string | null;
  ticketUrl: string | null;
  performances: TheaterSeasonPerformance[];
  upcomingPerformanceCount: number;
};

export type TheaterSeasonExtractResult = {
  performances: TheaterSeasonPerformance[];
  productions: TheaterSeasonProduction[];
  excludedExpiredProductions: number;
  excludedExpiredPerformances: number;
  /** Alias used by season-lane tests. */
  expiredPerformanceCount: number;
  productionGroupCount: number;
  performanceCount: number;
  evidence: string[];
};

const MONTHS: Record<string, string> = {
  january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
  april: '04', apr: '04', may: '05', june: '06', jun: '06', july: '07', jul: '07',
  august: '08', aug: '08', september: '09', sep: '09', sept: '09',
  october: '10', oct: '10', november: '11', nov: '11', december: '12', dec: '12',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function localYmd(now = new Date(), timeZone = THEATER_SEASON_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parseClock(text: string): string | null {
  const m = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2]!;
  const ap = m[3]!.toLowerCase();
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}:00`;
}

function parseRunRange(text: string): { startDate: string | null; endDate: string | null; year: number | null } {
  const cleaned = decodeEntities(text);
  const m = cleaned.match(
    /([A-Za-z]+)\s+(\d{1,2})\s*[–-]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}),?\s*(\d{4})/i,
  );
  if (!m) return { startDate: null, endDate: null, year: null };
  const startMonth = MONTHS[m[1]!.toLowerCase()];
  const endMonth = m[3] ? MONTHS[m[3].toLowerCase()] : startMonth;
  const year = Number(m[5]);
  if (!startMonth || !endMonth || !year) return { startDate: null, endDate: null, year: null };
  return {
    startDate: `${year}-${startMonth}-${String(Number(m[2])).padStart(2, '0')}`,
    endDate: `${year}-${endMonth}-${String(Number(m[4])).padStart(2, '0')}`,
    year,
  };
}

function parsePerformanceAnchor(
  text: string,
  runYear: number | null,
): { date: string | null; time: string | null; label: string } {
  const label = decodeEntities(text);
  const clock = parseClock(label);
  const m = label.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+([A-Za-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/i,
  );
  if (!m) return { date: null, time: clock, label };
  const mm = MONTHS[m[1]!.toLowerCase()];
  if (!mm) return { date: null, time: clock, label };
  const year = m[3] ? Number(m[3]) : runYear;
  if (!year) return { date: null, time: clock, label };
  return {
    date: `${year}-${mm}-${String(Number(m[2])).padStart(2, '0')}`,
    time: clock,
    label,
  };
}

export function looksLikeTheaterSeasonPage(html: string, pageUrl?: string): boolean {
  const pathHint = (() => {
    try {
      return /current-season|season|productions?/i.test(new URL(pageUrl ?? '').pathname);
    } catch {
      return false;
    }
  })();
  // Hostname alone is never enough — require production structure.
  const headings =
    (html.match(/data-production=/gi)?.length ?? 0) ||
    (html.match(/<h2[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>/gi)?.length ?? 0) ||
    (html.match(/production-block/gi)?.length ?? 0);
  const hasShowDates = /Show Dates/i.test(html);
  const hasTickets = /onthestage\.tickets/i.test(html);
  if (headings >= 2 && (hasShowDates || hasTickets || pathHint)) return true;
  if (pathHint && (hasShowDates || hasTickets) && headings >= 1) return true;
  return false;
}

function extractSections(html: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = [];
  const blockRe =
    /<section[^>]*(?:data-production="([^"]+)"|data-production='([^']+)'|class="[^"]*production-block[^"]*")[^>]*>([\s\S]*?)<\/section>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const body = m[0] ?? '';
    const titled =
      m[1] ||
      m[2] ||
      body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ||
      '';
    const title = decodeEntities(titled.replace(/<[^>]+>/g, ' '));
    if (title) sections.push({ title, body });
  }
  if (sections.length >= 2) return sections;

  const h2Re = /<h2[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/gi;
  const hits: Array<{ title: string; index: number }> = [];
  while ((m = h2Re.exec(html)) !== null) {
    const title = decodeEntities(m[1]!.replace(/<[^>]+>/g, ' '));
    if (!title || /current season/i.test(title)) continue;
    hits.push({ title, index: m.index });
  }
  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i]!.index;
    const end = i + 1 < hits.length ? hits[i + 1]!.index : Math.min(html.length, start + 20_000);
    sections.push({ title: hits[i]!.title, body: html.slice(start, end) });
  }
  return sections;
}

export function extractTheaterSeasonListings(input: {
  html: string;
  pageUrl: string;
  now?: Date;
  defaultVenue?: string | null;
}): TheaterSeasonExtractResult {
  const now = input.now ?? new Date();
  const today = localYmd(now);
  const sections = extractSections(input.html);
  const performances: TheaterSeasonPerformance[] = [];
  const productions: TheaterSeasonProduction[] = [];
  let excludedExpiredProductions = 0;
  let excludedExpiredPerformances = 0;
  const evidence = [`tz:${THEATER_SEASON_TIME_ZONE}`, `sections:${sections.length}`];
  const venue = input.defaultVenue ?? 'KC Melting Pot Theatre';

  for (const section of sections) {
    const runText =
      section.body.match(/([A-Za-z]+\s+\d{1,2}\s*[–-]\s*(?:[A-Za-z]+\s+)?\d{1,2},?\s*\d{4})/)?.[1] ||
      '';
    const run = parseRunRange(runText);
    const ticketHref =
      section.body.match(/href=["'](https?:\/\/onthestage\.tickets\/show\/[^"'#]+)/i)?.[1] || null;
    const onthestageId =
      ticketHref?.match(/onthestage\.tickets\/show\/[^/]+\/([a-f0-9]+)/i)?.[1] || null;
    const productionId = onthestageId ? `onthestage:${onthestageId}` : `season:${slugify(section.title)}`;
    const productionGroupKey = productionId;
    const anchors = [...section.body.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const upcoming: TheaterSeasonPerformance[] = [];
    let expiredForProduction = 0;

    for (const a of anchors) {
      const href = a[1] ?? '';
      const text = decodeEntities(a[2]!.replace(/<[^>]+>/g, ' '));
      if (!/at\s+\d{1,2}:\d{2}\s*(am|pm)/i.test(text)) continue;
      const parsed = parsePerformanceAnchor(text, run.year);
      if (!parsed.date || !parsed.time) continue;
      const startDateTime = `${parsed.date}T${parsed.time}`;
      const label = parsed.label.replace(/\s*\*.*$/, '').trim();
      const showUrl = (ticketHref || href).replace(/\/tickets#.*$/, '/').replace(/#.*$/, '');
      const row: TheaterSeasonPerformance = {
        externalId: `${productionId}@${startDateTime}`,
        title: section.title,
        startDate: parsed.date,
        startDateTime,
        endDate: null,
        endDateTime: null,
        venue,
        eventUrl: showUrl,
        ticketOrRsvpUrl: href || showUrl,
        evidence: [
          'theater_season_html',
          `production:${section.title}`,
          `start:${parsed.date}`,
          `start_time:${parsed.time}`,
          `performance_label:${label}`,
        ],
        productionTitle: section.title,
        productionId,
        productionGroupKey,
        listingRole: 'performance',
        performanceLabel: label,
        runStartDate: run.startDate,
        runEndDate: run.endDate,
      };
      if (parsed.date >= today) upcoming.push(row);
      else expiredForProduction += 1;
    }

    excludedExpiredPerformances += expiredForProduction;
    const productionUpcoming = upcoming.length > 0 || (run.endDate != null && run.endDate >= today);
    if (!productionUpcoming) {
      excludedExpiredProductions += 1;
      continue;
    }
    performances.push(...upcoming);
    productions.push({
      title: section.title,
      productionTitle: section.title,
      productionId,
      productionGroupKey,
      runStartDate: run.startDate,
      runEndDate: run.endDate,
      ticketUrl: ticketHref,
      performances: upcoming,
      upcomingPerformanceCount: upcoming.length,
    });
  }

  evidence.push(`upcoming_performances:${performances.length}`);
  evidence.push(`expired_performances:${excludedExpiredPerformances}`);
  evidence.push(`production_groups:${productions.length}`);

  return {
    performances,
    productions,
    excludedExpiredProductions,
    excludedExpiredPerformances,
    expiredPerformanceCount: excludedExpiredPerformances,
    productionGroupCount: productions.length,
    performanceCount: performances.length,
    evidence,
  };
}

export function groupTheaterSeasonPerformancesForWatchlist(
  events: Array<Pick<ExtractedEventListing, 'productionGroupKey' | 'productionTitle' | 'productionId' | 'title'>>,
): Array<{ productionGroupKey: string; productionTitle: string; performanceCount: number }> {
  const map = new Map<string, { productionGroupKey: string; productionTitle: string; performanceCount: number }>();
  for (const ev of events) {
    const key =
      ev.productionGroupKey ||
      ev.productionId ||
      `title:${(ev.productionTitle || ev.title || 'unknown').toLowerCase()}`;
    const title = ev.productionTitle || ev.title || key;
    const existing = map.get(key);
    if (existing) existing.performanceCount += 1;
    else map.set(key, { productionGroupKey: key, productionTitle: title, performanceCount: 1 });
  }
  return [...map.values()];
}
