import {
  loadRevenueDirectory,
  type NormalizedRevenueOpportunity,
  type RevenueDirectoryEntry,
} from './revenue-alignment-shared.js';

export type WineTastingKcSourceConfig = {
  venues?: RevenueDirectoryEntry[];
};

const DEFAULT_VENUES: RevenueDirectoryEntry[] = [
  {
    slug: 'amigoni-urban-winery',
    businessName: 'Amigoni Urban Winery',
    title: 'Amigoni Urban Winery — West Bottoms wine tastings & events',
    venue: 'Amigoni Urban Winery',
    address: '1520 Genessee Street, Kansas City, MO 64102',
    neighborhood: 'west bottoms',
    website: 'https://www.amigoni.com/',
    description:
      'Urban winery in the West Bottoms with tasting room flights, wine club events, and private tasting reservations.',
    category: 'wine_tasting',
  },
  {
    slug: 'edgecombe-wines',
    businessName: 'Edgecombe Wines',
    title: 'Edgecombe Wines — Plaza wine bar & curated tastings',
    venue: 'Edgecombe Wines',
    address: '4124 Pennsylvania Avenue, Kansas City, MO 64111',
    neighborhood: 'plaza',
    website: 'https://www.edgecombewines.com/',
    description:
      'Plaza wine bar with by-the-glass tastings, bottle shop, and sommelier-led wine events for date nights.',
    category: 'wine_tasting',
  },
  {
    slug: 'cellar-222',
    businessName: 'Cellar 222',
    title: 'Cellar 222 — wine bar & tasting room in Brookside',
    venue: 'Cellar 222',
    address: '6224 Brookside Plaza, Kansas City, MO 64113',
    neighborhood: 'brookside',
    website: 'https://www.cellar222.com/',
    description:
      'Brookside wine bar with curated flights, small plates, and recurring wine tasting events for couples.',
    category: 'wine_tasting',
  },
  {
    slug: 'broadside-kc',
    businessName: 'Broadside',
    title: 'Broadside — Westport wine bar & natural wine tastings',
    venue: 'Broadside',
    address: '4128 Pennsylvania Avenue, Kansas City, MO 64111',
    neighborhood: 'westport',
    website: 'https://www.broadsidekc.com/',
    description:
      'Natural wine-focused bar with tasting events, wine dinners, and intimate date-night seating.',
    category: 'wine_tasting',
  },
  {
    slug: 'cafe-trio-wine',
    businessName: 'Café Trio Wine Dinners',
    title: 'Café Trio — Plaza wine dinner series & tastings',
    venue: 'Café Trio',
    address: '4550 Main Street, Kansas City, MO 64111',
    neighborhood: 'plaza',
    website: 'https://www.cafetrio.com/',
    description:
      'Plaza restaurant with recurring wine dinner events pairing multi-course menus with regional and international wines.',
    category: 'wine_tasting',
  },
];

export function parseWineTastingKcSourceConfig(raw: unknown): WineTastingKcSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.venues)) {
    return { venues: c.venues as RevenueDirectoryEntry[] };
  }
  return { venues: DEFAULT_VENUES };
}

export async function loadWineTastingKc(
  config: WineTastingKcSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseWineTastingKcSourceConfig(config);
  return loadRevenueDirectory(parsed.venues ?? DEFAULT_VENUES, '#wine-tasting');
}
