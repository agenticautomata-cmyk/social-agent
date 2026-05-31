import { extractLocationClues } from './reddit.js';

export type EstateSalesNetSourceConfig = {
  zipPageUrls?: string[];
  horizonDays?: number;
  requestDelayMs?: number;
};

export type NormalizedEstateSale = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  company: string | null;
  locationClues: string[];
  locationHint: string | null;
  estateSaleFlag: boolean;
};

type NgrxDate = { _type?: string; _value?: string };

type NgrxSaleRow = {
  id: number;
  name: string;
  orgName: string | null;
  address: string;
  cityName: string;
  stateCode: string;
  postalCodeNumber: string;
  typeName: string;
  isMarketplaceSale: boolean;
  isPublished: boolean;
  utcDateDeleted: NgrxDate | null;
  firstLocalStartDate: NgrxDate;
  lastLocalEndDate: NgrxDate;
  utcDateFirstPublished: NgrxDate;
  auctionUrl?: string;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';

const DEFAULT_ZIP_PAGES = [
  'https://www.estatesales.net/MO/Kansas-City/64108',
  'https://www.estatesales.net/MO/Kansas-City/64111',
  'https://www.estatesales.net/MO/Kansas-City/64112',
  'https://www.estatesales.net/MO/Kansas-City/64114',
  'https://www.estatesales.net/MO/Kansas-City/64106',
  'https://www.estatesales.net/KS/Overland-Park/66204',
  'https://www.estatesales.net/KS/Overland-Park/66221',
  'https://www.estatesales.net/KS/Leawood/66209',
  'https://www.estatesales.net/MO/Lees-Summit/64086',
  'https://www.estatesales.net/MO/Independence/64055',
];

const NEIGHBORHOOD_HINTS = [
  'sunset hills',
  'mission hills',
  'prairie village',
  'brookside',
  'waldo',
  'plaza',
  'crossroads',
  'westport',
  'river market',
  'midtown',
  'downtown',
  'northland',
  'northeast',
  'south kc',
  'west bottoms',
];

export function parseEstateSalesNetSourceConfig(raw: unknown): EstateSalesNetSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    zipPageUrls: Array.isArray(c.zipPageUrls)
      ? c.zipPageUrls.filter((u): u is string => typeof u === 'string')
      : DEFAULT_ZIP_PAGES,
    horizonDays: typeof c.horizonDays === 'number' ? c.horizonDays : 60,
    requestDelayMs: typeof c.requestDelayMs === 'number' ? c.requestDelayMs : 250,
  };
}

function parseNgrxDate(raw: NgrxDate | null | undefined): Date | null {
  if (!raw?._value) return null;
  const d = new Date(raw._value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function citySlug(cityName: string): string {
  return cityName.trim().replace(/\s+/g, '-');
}

export function buildEstateSalesNetUrl(row: Pick<NgrxSaleRow, 'id' | 'stateCode' | 'cityName' | 'postalCodeNumber' | 'isMarketplaceSale'>): string {
  const base = 'https://www.estatesales.net';
  const state = row.stateCode;
  const city = citySlug(row.cityName);
  const zip = row.postalCodeNumber;
  const id = row.id;
  if (row.isMarketplaceSale) {
    return `${base}/${state}/${city}/${zip}/marketplace/${id}`;
  }
  return `${base}/${state}/${city}/${zip}/${id}`;
}

export function inferEstateSaleNeighborhood(
  title: string,
  address: string | null,
  city: string | null,
): string | null {
  const text = `${title} ${address ?? ''} ${city ?? ''}`.toLowerCase();
  const clues = extractLocationClues(title, address ?? '');
  for (const hint of NEIGHBORHOOD_HINTS) {
    if (text.includes(hint) || clues.some((c) => c.includes(hint))) return hint;
  }
  return clues[0] ?? null;
}

function formatAddress(street: string, city: string, state: string, zip: string): string | null {
  const parts = [street.trim(), city.trim(), `${state.trim()} ${zip.trim()}`.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function normalizeSaleRow(row: NgrxSaleRow): NormalizedEstateSale | null {
  if (!row.isPublished || row.utcDateDeleted) return null;

  const eventStartsAt = parseNgrxDate(row.firstLocalStartDate);
  const eventEndsAt = parseNgrxDate(row.lastLocalEndDate);
  const publishedAt = parseNgrxDate(row.utcDateFirstPublished) ?? new Date();

  const street = row.address?.trim() ?? '';
  const address = street
    ? formatAddress(street, row.cityName, row.stateCode, row.postalCodeNumber)
    : null;

  const title = row.name.trim();
  const city = row.cityName.trim() || null;
  const company = row.orgName?.trim() || null;
  const locationClues = extractLocationClues(title, `${address ?? ''} ${city ?? ''}`);
  const neighborhood = inferEstateSaleNeighborhood(title, address, city);

  const bodyParts = [
    company ? `Company: ${company}` : null,
    row.typeName ? `Type: ${row.typeName}` : null,
    address ? `Address: ${address}` : null,
    city ? `City: ${city}` : null,
  ].filter(Boolean);

  return {
    externalId: String(row.id),
    title,
    body: bodyParts.join('\n'),
    url: buildEstateSalesNetUrl(row),
    publishedAt,
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

function extractSaleRows(html: string): Record<string, NgrxSaleRow> {
  const match = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return {};
  try {
    const state = JSON.parse(match[1]) as {
      NGRX_STATE?: { ui?: { sales?: { saleRows?: Record<string, NgrxSaleRow> } } };
    };
    return state.NGRX_STATE?.ui?.sales?.saleRows ?? {};
  } catch {
    return {};
  }
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

async function fetchZipPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`EstateSales.net fetch failed (${res.status}): ${url}`);
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadEstateSalesNetSales(config: EstateSalesNetSourceConfig): Promise<NormalizedEstateSale[]> {
  const parsed = parseEstateSalesNetSourceConfig(config);
  const byId = new Map<string, NormalizedEstateSale>();

  for (const pageUrl of parsed.zipPageUrls ?? DEFAULT_ZIP_PAGES) {
    const html = await fetchZipPage(pageUrl);
    const rows = extractSaleRows(html);
    for (const row of Object.values(rows)) {
      const item = normalizeSaleRow(row);
      if (!item) continue;
      if (!withinHorizon(item, parsed.horizonDays ?? 60)) continue;
      byId.set(item.externalId, item);
    }
    if (parsed.requestDelayMs) await sleep(parsed.requestDelayMs);
  }

  return [...byId.values()];
}
