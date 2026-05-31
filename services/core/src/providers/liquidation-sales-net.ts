import { extractLocationClues } from './reddit.js';
import {
  buildAudienceDeal,
  dedupeAudienceDeals,
  type NormalizedAudienceDeal,
} from './closings-deals-shared.js';
import { buildEstateSalesNetUrl, inferEstateSaleNeighborhood } from './estate-sales-net.js';

export type LiquidationSalesNetSourceConfig = {
  zipPageUrls?: string[];
  horizonDays?: number;
  requestDelayMs?: number;
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
  type: number;
  typeName: string;
  isMarketplaceSale: boolean;
  isPublished: boolean;
  utcDateDeleted: NgrxDate | null;
  firstLocalStartDate: NgrxDate;
  lastLocalEndDate: NgrxDate;
  utcDateFirstPublished: NgrxDate;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';

const DEFAULT_ZIP_PAGES = [
  'https://www.estatesales.net/MO/Kansas-City/64108',
  'https://www.estatesales.net/MO/Kansas-City/64111',
  'https://www.estatesales.net/KS/Overland-Park/66204',
  'https://www.estatesales.net/KS/Overland-Park/66221',
  'https://www.estatesales.net/MO/Lees-Summit/64086',
];

const LIQUIDATION_NAME_RE =
  /\b(liquidation|going out of business|store closing|moving sale|closeout|clearance|everything must go|final sale|retail|warehouse|inventory)\b/i;

export function parseLiquidationSalesNetSourceConfig(raw: unknown): LiquidationSalesNetSourceConfig {
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

function isLiquidationSale(row: NgrxSaleRow): boolean {
  if (row.typeName === 'MovingSales') return true;
  const text = `${row.name} ${row.orgName ?? ''}`.toLowerCase();
  return LIQUIDATION_NAME_RE.test(text);
}

function formatAddress(street: string, city: string, state: string, zip: string): string | null {
  const parts = [street.trim(), city.trim(), `${state.trim()} ${zip.trim()}`.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
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

function normalizeLiquidationRow(row: NgrxSaleRow): NormalizedAudienceDeal | null {
  if (!row.isPublished || row.utcDateDeleted || !isLiquidationSale(row)) return null;

  const startDate = parseNgrxDate(row.firstLocalStartDate);
  const endDate = parseNgrxDate(row.lastLocalEndDate);
  const publishedAt = parseNgrxDate(row.utcDateFirstPublished) ?? new Date();
  const street = row.address?.trim() ?? '';
  const address = street
    ? formatAddress(street, row.cityName, row.stateCode, row.postalCodeNumber)
    : null;
  const businessName = row.orgName?.trim() || row.name.trim();
  const title = row.name.trim();
  const url = `${buildEstateSalesNetUrl(row)}#liquidation-sale`;
  const locationClues = extractLocationClues(title, `${address ?? ''} ${row.cityName}`);
  const neighborhood = inferEstateSaleNeighborhood(title, address, row.cityName);

  return buildAudienceDeal({
    externalId: `liquidation-${row.id}`,
    title,
    body: [
      businessName !== title ? `Company: ${businessName}` : null,
      `Type: ${row.typeName}`,
      address ? `Address: ${address}` : null,
      `City: ${row.cityName}`,
    ].filter(Boolean).join('\n'),
    businessName,
    category: 'liquidation_sale',
    sourceUrl: url,
    website: null,
    publishedAt,
    startDate,
    endDate,
    address,
    neighborhood,
  });
}

function withinHorizon(start: Date | null, end: Date | null, horizonDays: number): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  if (end && end < now) return false;
  if (start && start > horizonEnd) return false;
  return true;
}

async function fetchZipPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`EstateSales.net liquidation fetch failed (${res.status}): ${url}`);
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadLiquidationSalesNet(
  config: LiquidationSalesNetSourceConfig,
): Promise<NormalizedAudienceDeal[]> {
  const parsed = parseLiquidationSalesNetSourceConfig(config);
  const byId = new Map<string, NormalizedAudienceDeal>();

  for (const pageUrl of parsed.zipPageUrls ?? DEFAULT_ZIP_PAGES) {
    const html = await fetchZipPage(pageUrl);
    for (const row of Object.values(extractSaleRows(html))) {
      const item = normalizeLiquidationRow(row);
      if (!item) continue;
      if (!withinHorizon(item.startDate, item.endDate, parsed.horizonDays ?? 60)) continue;
      byId.set(item.externalId, item);
    }
    if (parsed.requestDelayMs) await sleep(parsed.requestDelayMs);
  }

  return dedupeAudienceDeals([...byId.values()]);
}
