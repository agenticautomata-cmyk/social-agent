import {
  inferEstateSaleNeighborhood,
  type NormalizedEstateSale,
} from './estate-sales-net.js';
import { extractLocationClues } from './reddit.js';

export type EstateSalesOrgSourceConfig = {
  listingUrl?: string;
  horizonDays?: number;
  requestDelayMs?: number;
  maxDetailFetches?: number;
};

type SchemaEvent = {
  '@type'?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  description?: string;
  eventAttendanceMode?: string;
  location?: {
    '@type'?: string;
    url?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
      postalCode?: string;
    };
  };
  organizer?: {
    name?: string;
    url?: string;
  };
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_LISTING_URL = 'https://estatesales.org/estate-sales/mo/kansas-city';
const SALE_LINK_RE = /href="(\/estate-sales\/mo\/[^"]+?-(\d+))"/gi;

export function parseEstateSalesOrgSourceConfig(raw: unknown): EstateSalesOrgSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    listingUrl: typeof c.listingUrl === 'string' ? c.listingUrl : DEFAULT_LISTING_URL,
    horizonDays: typeof c.horizonDays === 'number' ? c.horizonDays : 60,
    requestDelayMs: typeof c.requestDelayMs === 'number' ? c.requestDelayMs : 300,
    maxDetailFetches: typeof c.maxDetailFetches === 'number' ? c.maxDetailFetches : 40,
  };
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseEventDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractListingLinks(html: string): Array<{ path: string; externalId: string }> {
  const seen = new Set<string>();
  const links: Array<{ path: string; externalId: string }> = [];
  for (const match of html.matchAll(SALE_LINK_RE)) {
    const path = match[1];
    const externalId = match[2];
    if (!path || !externalId || path.includes('/gallery')) continue;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    links.push({ path, externalId });
  }
  return links;
}

function parseEventJsonLd(html: string): SchemaEvent | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1]!) as SchemaEvent;
      if (data['@type'] === 'Event' && data.name) return data;
    } catch {
      // try next block
    }
  }
  return null;
}

function formatAddress(addr: SchemaEvent['location'] extends infer L ? L : never): string | null {
  const a = addr && typeof addr === 'object' && 'address' in addr ? addr.address : null;
  if (!a || typeof a !== 'object') return null;
  const street = a.streetAddress?.trim();
  const city = a.addressLocality?.trim();
  const region = a.addressRegion?.trim();
  const zip = a.postalCode?.trim();
  const parts = [street, city, region && zip ? `${region} ${zip}` : region ?? zip].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function normalizeEvent(path: string, externalId: string, event: SchemaEvent): NormalizedEstateSale | null {
  const title = decodeHtml(event.name?.trim() ?? '');
  if (!title) return null;

  const eventStartsAt = parseEventDate(event.startDate);
  const eventEndsAt = parseEventDate(event.endDate);
  const url = event.url ?? `https://estatesales.org${path}`;
  const company = decodeHtml(event.organizer?.name?.trim() ?? '') || null;
  const address = formatAddress(event.location);
  const city =
    event.location && typeof event.location === 'object' && 'address' in event.location
      ? event.location.address?.addressLocality?.trim() ?? null
      : null;

  const body = decodeHtml(event.description?.trim() ?? '') || [
    company ? `Company: ${company}` : null,
    address ? `Address: ${address}` : null,
    city ? `City: ${city}` : null,
  ].filter(Boolean).join('\n');

  const locationClues = extractLocationClues(title, `${body} ${address ?? ''}`);
  const neighborhood = inferEstateSaleNeighborhood(title, address, city);

  return {
    externalId,
    title,
    body: body.slice(0, 4000),
    url,
    publishedAt: eventStartsAt ?? new Date(),
    eventStartsAt,
    eventEndsAt,
    address,
    neighborhood,
    city,
    company,
    locationClues,
    locationHint: neighborhood ?? city ?? locationClues[0] ?? null,
    estateSaleFlag: true,
  };
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
  if (!res.ok) throw new Error(`EstateSales.org fetch failed (${res.status}): ${url}`);
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadEstateSalesOrgSales(config: EstateSalesOrgSourceConfig): Promise<NormalizedEstateSale[]> {
  const parsed = parseEstateSalesOrgSourceConfig(config);
  const listingHtml = await fetchPage(parsed.listingUrl ?? DEFAULT_LISTING_URL);
  const links = extractListingLinks(listingHtml).slice(0, parsed.maxDetailFetches ?? 40);

  const items: NormalizedEstateSale[] = [];
  for (const link of links) {
    const detailUrl = `https://estatesales.org${link.path}`;
    const html = await fetchPage(detailUrl);
    const event = parseEventJsonLd(html);
    if (!event) continue;
    const item = normalizeEvent(link.path, link.externalId, event);
    if (!item) continue;
    if (!withinHorizon(item, parsed.horizonDays ?? 60)) continue;
    items.push(item);
    if (parsed.requestDelayMs) await sleep(parsed.requestDelayMs);
  }

  return items;
}
