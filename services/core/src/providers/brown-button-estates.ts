import {
  inferEstateSaleNeighborhood,
  type NormalizedEstateSale,
} from './estate-sales-net.js';
import { extractLocationClues } from './reddit.js';

export type BrownButtonEstatesSourceConfig = {
  upcomingUrl?: string;
  horizonDays?: number;
  requestDelayMs?: number;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_UPCOMING_URL = 'https://brownbutton.com/upcoming-estate-sales/';
const COMPANY_NAME = 'Brown Button Estate Sale Services';

const MONTH_MAP: Record<string, number> = {
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

export function parseBrownButtonEstatesSourceConfig(raw: unknown): BrownButtonEstatesSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    upcomingUrl: typeof c.upcomingUrl === 'string' ? c.upcomingUrl : DEFAULT_UPCOMING_URL,
    horizonDays: typeof c.horizonDays === 'number' ? c.horizonDays : 60,
    requestDelayMs: typeof c.requestDelayMs === 'number' ? c.requestDelayMs : 200,
  };
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '–');
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

type ListingCard = {
  url: string;
  slug: string;
  title: string;
  dateHint: string | null;
};

function parseDayToken(token: string, month: number, year: number): Date | null {
  const day = parseInt(token.replace(/\D/g, ''), 10);
  if (!Number.isFinite(day)) return null;
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBiddingDateRange(hint: string, refYear: number): { start: Date | null; end: Date | null } {
  const m = hint.match(
    /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?/i,
  );
  if (!m) return { start: null, end: null };
  const monthKey = m[1]!.toLowerCase();
  const month = MONTH_MAP[monthKey];
  if (month === undefined) return { start: null, end: null };
  return {
    start: parseDayToken(m[2]!, month, refYear),
    end: parseDayToken(m[3]!, month, refYear),
  };
}

function inferCityFromTitle(title: string): string | null {
  const patterns = [
    /\b(Kansas City)\b/i,
    /\b(Overland Park)\b/i,
    /\b(Prairie Village)\b/i,
    /\b(Mission Hills)\b/i,
    /\b(Leawood)\b/i,
    /\b(Shawnee)\b/i,
    /\b(Parkville)\b/i,
    /\b(Lee'?s Summit)\b/i,
    /\b(Independence)\b/i,
    /\b(Liberty)\b/i,
    /\b(Olathe)\b/i,
    /\b(KCMO)\b/i,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m?.[1]) return m[1].replace(/\bKCMO\b/i, 'Kansas City');
  }
  if (/kansas city|kcmo/i.test(title)) return 'Kansas City';
  return null;
}

function extractListingCards(html: string): ListingCard[] {
  const cards: ListingCard[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /href="(https:\/\/brownbutton\.com\/estate_sales\/([^"/]+)\/)"[^>]*>([\s\S]{0,400}?)<\/a>/gi,
  )) {
    const url = match[1]!;
    const slug = match[2]!;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const chunk = match[0] ?? '';
    const titleMatch = chunk.match(/>([^<]{8,200})</);
    const title = stripTags(titleMatch?.[1] ?? slug.replace(/-/g, ' '));
    const dateHintMatch = chunk.match(/Bidding open ([^<]{5,40})/i);
    cards.push({
      url,
      slug,
      title,
      dateHint: dateHintMatch?.[1]?.trim() ?? null,
    });
  }

  return cards;
}

function withinHorizon(item: NormalizedEstateSale, horizonDays: number): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

  if (item.eventEndsAt && item.eventEndsAt < now) return false;
  if (item.eventStartsAt && item.eventStartsAt > horizonEnd) return false;
  return true;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Brown Button fetch failed (${res.status}): ${url}`);
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadBrownButtonEstates(config: BrownButtonEstatesSourceConfig): Promise<NormalizedEstateSale[]> {
  const parsed = parseBrownButtonEstatesSourceConfig(config);
  const html = await fetchPage(parsed.upcomingUrl ?? DEFAULT_UPCOMING_URL);
  const cards = extractListingCards(html);
  const refYear = new Date().getFullYear();
  const items: NormalizedEstateSale[] = [];

  for (const card of cards) {
    const { start, end } = card.dateHint
      ? parseBiddingDateRange(card.dateHint, refYear)
      : { start: null, end: null };

    const city = inferCityFromTitle(card.title);
    const locationClues = extractLocationClues(card.title, city ?? '');
    const neighborhood = inferEstateSaleNeighborhood(card.title, null, city);

    const item: NormalizedEstateSale = {
      externalId: card.slug,
      title: card.title,
      body: [
        `Company: ${COMPANY_NAME}`,
        city ? `City: ${city}` : null,
        card.dateHint ? `Dates: ${card.dateHint}` : null,
      ].filter(Boolean).join('\n'),
      url: card.url,
      publishedAt: start ?? new Date(),
      eventStartsAt: start,
      eventEndsAt: end,
      address: null,
      neighborhood,
      city,
      company: COMPANY_NAME,
      locationClues,
      locationHint: neighborhood ?? city ?? locationClues[0] ?? null,
      estateSaleFlag: true,
    };

    if (!withinHorizon(item, parsed.horizonDays ?? 60)) continue;
    items.push(item);
    if (parsed.requestDelayMs) await sleep(parsed.requestDelayMs);
  }

  return items;
}
