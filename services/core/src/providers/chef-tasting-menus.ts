import {
  loadRevenueDirectory,
  type NormalizedRevenueOpportunity,
  type RevenueDirectoryEntry,
} from './revenue-alignment-shared.js';

export type ChefTastingMenusSourceConfig = {
  restaurants?: RevenueDirectoryEntry[];
};

const DEFAULT_RESTAURANTS: RevenueDirectoryEntry[] = [
  {
    slug: 'corvino-supper-club',
    businessName: 'Corvino Supper Club & Tasting Room',
    title: 'Corvino — chef tasting menus & supper club date nights',
    venue: 'Corvino Supper Club & Tasting Room',
    address: '1830 Cherry Street, Kansas City, MO 64108',
    neighborhood: 'crossroads',
    website: 'https://www.corvinokc.com/',
    description:
      'James Beard Award-winning chef Michael Corvino offers multi-course tasting menus and intimate supper club experiences.',
    category: 'luxury_dining',
  },
  {
    slug: 'the-antler-room',
    businessName: 'The Antler Room',
    title: 'The Antler Room — seasonal chef tasting menus in Crossroads',
    venue: 'The Antler Room',
    address: '1806 Locust Street, Kansas City, MO 64108',
    neighborhood: 'crossroads',
    website: 'https://www.theantlerroom.com/',
    description:
      'New American fine dining with rotating chef-driven tasting menus and wine pairings in the Crossroads Arts District.',
    category: 'luxury_dining',
  },
  {
    slug: 'bluestem',
    businessName: 'Bluestem',
    title: 'Bluestem — prix fixe tasting menus & wine pairings',
    venue: 'Bluestem',
    address: '900 West 47th Street, Kansas City, MO 64112',
    neighborhood: 'plaza',
    website: 'https://www.bluestemkc.com/',
    description:
      'Award-winning New American restaurant with prix fixe tasting menus and sommelier-curated wine pairings near the Plaza.',
    category: 'luxury_dining',
  },
  {
    slug: 'lazia',
    businessName: 'Lazia',
    title: 'Lazia — Italian fine dining & chef special menus',
    venue: 'Lazia',
    address: '910 West 39th Street, Kansas City, MO 64111',
    neighborhood: 'westport',
    website: 'https://www.laziakc.com/',
    description:
      'Upscale Italian with chef specials, wine dinners, and reservation-worthy date-night dining in Westport.',
    category: 'luxury_dining',
  },
  {
    slug: 'the-rieger',
    businessName: 'The Rieger',
    title: 'The Rieger — historic fine dining & chef tasting experiences',
    venue: 'The Rieger',
    address: '1929 Main Street, Kansas City, MO 64108',
    neighborhood: 'crossroads',
    website: 'https://www.theriegerkc.com/',
    description:
      'Historic Crossroads restaurant with chef-driven seasonal menus, craft cocktails, and special tasting events.',
    category: 'luxury_dining',
  },
  {
    slug: 'savoy-at-21c',
    businessName: 'The Savoy at 21c',
    title: 'The Savoy at 21c — chef-driven tasting menus & wine program',
    venue: 'The Savoy at 21c Museum Hotel',
    address: '219 W 9th Street, Kansas City, MO 64105',
    neighborhood: 'downtown',
    website: 'https://www.21cmuseumhotels.com/kansas-city/restaurant/',
    description:
      'Fine dining at 21c Museum Hotel with chef tasting menus, local sourcing, and an extensive wine program for luxury date nights.',
    category: 'luxury_dining',
  },
];

export function parseChefTastingMenusSourceConfig(raw: unknown): ChefTastingMenusSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.restaurants)) {
    return { restaurants: c.restaurants as RevenueDirectoryEntry[] };
  }
  return { restaurants: DEFAULT_RESTAURANTS };
}

export async function loadChefTastingMenus(
  config: ChefTastingMenusSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseChefTastingMenusSourceConfig(config);
  return loadRevenueDirectory(parsed.restaurants ?? DEFAULT_RESTAURANTS, '#chef-tasting-menu');
}
