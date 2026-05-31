import {
  loadRevenueDirectory,
  type NormalizedRevenueOpportunity,
  type RevenueDirectoryEntry,
} from './revenue-alignment-shared.js';

export type KcHotelPackagesSourceConfig = {
  hotels?: RevenueDirectoryEntry[];
};

const DEFAULT_HOTELS: RevenueDirectoryEntry[] = [
  {
    slug: '21c-museum-hotel',
    businessName: '21c Museum Hotel Kansas City',
    title: '21c Museum Hotel — art-forward boutique packages & date-night stays',
    venue: '21c Museum Hotel',
    address: '219 W 9th Street, Kansas City, MO 64105',
    neighborhood: 'downtown',
    website: 'https://www.21cmuseumhotels.com/kansas-city/',
    description:
      'Boutique luxury hotel with on-site contemporary art museum, The Savoy at 21c fine dining, and seasonal stay packages in the Crossroads-adjacent downtown corridor.',
    category: 'hotel_package',
  },
  {
    slug: 'hotel-kansas-city',
    businessName: 'Hotel Kansas City',
    title: 'Hotel Kansas City — Curio Collection weekend packages & rooftop dining',
    venue: 'Hotel Kansas City',
    address: '1228 Baltimore Avenue, Kansas City, MO 64105',
    neighborhood: 'downtown',
    website: 'https://www.hotelkansascity.com/',
    description:
      'Historic luxury hotel with Mercury Room rooftop dining, spa services, and special offers for romantic weekend stays in downtown KC.',
    category: 'hotel_package',
  },
  {
    slug: 'crossroads-hotel',
    businessName: 'Crossroads Hotel',
    title: 'Crossroads Hotel — boutique packages with Percheron Rooftop',
    venue: 'Crossroads Hotel',
    address: '2101 Central Street, Kansas City, MO 64108',
    neighborhood: 'crossroads',
    website: 'https://www.crossroadshotelkc.com/',
    description:
      'Design-forward boutique hotel in the Crossroads with Percheron Rooftop bar, Locust cocktail bar, and curated local experience packages.',
    category: 'hotel_package',
  },
  {
    slug: 'loews-kansas-city',
    businessName: 'Loews Kansas City Hotel',
    title: 'Loews Kansas City — luxury packages & Nine Zero One rooftop',
    venue: 'Loews Kansas City Hotel',
    address: '1515 Wyandotte Street, Kansas City, MO 64108',
    neighborhood: 'power and light',
    website: 'https://www.loewshotels.com/kansas-city-hotel',
    description:
      'Convention-district luxury hotel with spa, rooftop bar Nine Zero One, and seasonal romance and getaway packages.',
    category: 'hotel_package',
  },
  {
    slug: 'the-raphael-hotel',
    businessName: 'The Raphael Hotel',
    title: 'The Raphael Hotel — Country Club Plaza luxury stay packages',
    venue: 'The Raphael Hotel',
    address: '325 Ward Parkway, Kansas City, MO 64112',
    neighborhood: 'plaza',
    website: 'https://www.raphaelhotels.com/',
    description:
      'Autograph Collection hotel on the Country Club Plaza with Chaz on the Plaza dining, spa, and romantic Plaza weekend packages.',
    category: 'hotel_package',
  },
  {
    slug: 'sheraton-crown-center',
    businessName: 'Sheraton Kansas City Hotel at Crown Center',
    title: 'Sheraton Crown Center — family & couples getaway packages',
    venue: 'Sheraton Kansas City Hotel at Crown Center',
    address: '2345 McGee Street, Kansas City, MO 64108',
    neighborhood: 'crown center',
    website: 'https://www.marriott.com/en-us/hotels/mciks-sheraton-kansas-city-hotel-at-crown-center/',
    description:
      'Connected to Crown Center shops and Union Station; offers seasonal hotel packages and date-night proximity to Kauffman Center.',
    category: 'hotel_package',
  },
];

export function parseKcHotelPackagesSourceConfig(raw: unknown): KcHotelPackagesSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.hotels)) {
    return { hotels: c.hotels as RevenueDirectoryEntry[] };
  }
  return { hotels: DEFAULT_HOTELS };
}

export async function loadKcHotelPackages(
  config: KcHotelPackagesSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseKcHotelPackagesSourceConfig(config);
  return loadRevenueDirectory(parsed.hotels ?? DEFAULT_HOTELS, '#hotel-package');
}
