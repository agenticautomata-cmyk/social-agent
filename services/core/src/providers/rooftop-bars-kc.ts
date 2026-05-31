import {
  loadRevenueDirectory,
  type NormalizedRevenueOpportunity,
  type RevenueDirectoryEntry,
} from './revenue-alignment-shared.js';

export type RooftopBarsKcSourceConfig = {
  venues?: RevenueDirectoryEntry[];
};

const DEFAULT_VENUES: RevenueDirectoryEntry[] = [
  {
    slug: 'percheron-rooftop',
    businessName: 'Percheron Rooftop Bar',
    title: 'Percheron Rooftop — Crossroads skyline cocktails & date nights',
    venue: 'Percheron Rooftop Bar at Crossroads Hotel',
    address: '2101 Central Street, Kansas City, MO 64108',
    neighborhood: 'crossroads',
    website: 'https://www.crossroadshotelkc.com/dine-drink/percheron-rooftop/',
    description:
      'Rooftop bar atop Crossroads Hotel with skyline views, craft cocktails, and seasonal outdoor seating ideal for date nights.',
    category: 'rooftop_experience',
  },
  {
    slug: 'nine-zero-one',
    businessName: 'Nine Zero One Rooftop Bar',
    title: 'Nine Zero One — Loews rooftop lounge with downtown views',
    venue: 'Nine Zero One at Loews Kansas City',
    address: '1515 Wyandotte Street, Kansas City, MO 64108',
    neighborhood: 'power and light',
    website: 'https://www.loewshotels.com/kansas-city-hotel/dining/nine-zero-one',
    description:
      'Rooftop lounge at Loews Kansas City with panoramic downtown views, cocktails, and small plates for evening dates.',
    category: 'rooftop_experience',
  },
  {
    slug: 'mercury-room',
    businessName: 'Mercury Room at Hotel Kansas City',
    title: 'Mercury Room — rooftop dining & cocktails at Hotel Kansas City',
    venue: 'Mercury Room',
    address: '1228 Baltimore Avenue, Kansas City, MO 64105',
    neighborhood: 'downtown',
    website: 'https://www.hotelkansascity.com/dining/mercury-room/',
    description:
      'Rooftop restaurant and bar with seasonal menus, skyline views, and reservation-worthy date-night atmosphere.',
    category: 'rooftop_experience',
  },
  {
    slug: '801-rooftop',
    businessName: '801 Rooftop',
    title: '801 Rooftop — Power & Light District rooftop lounge',
    venue: '801 Rooftop',
    address: '801 Grand Boulevard, Kansas City, MO 64106',
    neighborhood: 'downtown',
    website: 'https://www.801rooftop.com/',
    description:
      'Elevated rooftop lounge in the Power & Light District with craft cocktails, shared plates, and skyline views.',
    category: 'rooftop_experience',
  },
  {
    slug: 'hey-hey-club',
    businessName: 'Hey Hey Club at J. Rieger & Co.',
    title: 'Hey Hey Club — rooftop cocktails above J. Rieger distillery',
    venue: 'Hey Hey Club',
    address: '2700 Guinotte Avenue, Kansas City, MO 64120',
    neighborhood: 'east bottoms',
    website: 'https://www.jriegerco.com/hey-hey-club',
    description:
      'Rooftop cocktail bar above the historic J. Rieger & Co. distillery with views of the East Bottoms and downtown skyline.',
    category: 'rooftop_experience',
  },
  {
    slug: 'sky-cinema-rooftop',
    businessName: 'Sky Cinema Rooftop',
    title: 'Sky Cinema — rooftop movie nights & cocktails in Power & Light',
    venue: 'Sky Cinema Rooftop',
    address: '1300 Baltimore Avenue, Kansas City, MO 64105',
    neighborhood: 'power and light',
    website: 'https://www.skycinemakc.com/',
    description:
      'Open-air rooftop cinema with cocktails and skyline views — unique couples date-night experience in downtown KC.',
    category: 'rooftop_experience',
  },
];

export function parseRooftopBarsKcSourceConfig(raw: unknown): RooftopBarsKcSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.venues)) {
    return { venues: c.venues as RevenueDirectoryEntry[] };
  }
  return { venues: DEFAULT_VENUES };
}

export async function loadRooftopBarsKc(
  config: RooftopBarsKcSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseRooftopBarsKcSourceConfig(config);
  return loadRevenueDirectory(parsed.venues ?? DEFAULT_VENUES, '#rooftop-experience');
}
