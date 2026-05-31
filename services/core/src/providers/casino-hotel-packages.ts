import {
  loadRevenueDirectory,
  type NormalizedRevenueOpportunity,
  type RevenueDirectoryEntry,
} from './revenue-alignment-shared.js';

export type CasinoHotelPackagesSourceConfig = {
  properties?: RevenueDirectoryEntry[];
};

const DEFAULT_PROPERTIES: RevenueDirectoryEntry[] = [
  {
    slug: 'ameristar-kc',
    businessName: 'Ameristar Casino Hotel Kansas City',
    title: 'Ameristar — casino hotel packages & entertainment getaways',
    venue: 'Ameristar Casino Hotel Kansas City',
    address: '3200 N Ameristar Drive, Kansas City, MO 64161',
    neighborhood: 'northland',
    website: 'https://www.ameristarkansascity.com/',
    description:
      'Full-service casino resort with hotel packages, live entertainment, fine dining at 36° North, and couples getaway promotions.',
    category: 'hotel_package',
  },
  {
    slug: 'harrahs-kc',
    businessName: "Harrah's Kansas City",
    title: "Harrah's Kansas City — casino hotel packages & date-night entertainment",
    venue: "Harrah's Kansas City",
    address: '777 N Ameristar Drive, Kansas City, MO 64161',
    neighborhood: 'northland',
    website: 'https://www.caesars.com/harrahs-kansas-city',
    description:
      'Caesars Entertainment property with hotel packages, casino gaming, multiple dining venues, and weekend entertainment specials.',
    category: 'hotel_package',
  },
  {
    slug: 'ballys-kc',
    businessName: "Bally's Kansas City",
    title: "Bally's Kansas City — casino resort packages & nightlife",
    venue: "Bally's Kansas City",
    address: '1800 E Front Street, Kansas City, MO 64120',
    neighborhood: 'east kansas city',
    website: 'https://www.caesars.com/ballys-kansas-city',
    description:
      'Riverboat casino and hotel with dining, live music, and promotional stay-and-play packages for KC metro getaways.',
    category: 'hotel_package',
  },
];

export function parseCasinoHotelPackagesSourceConfig(raw: unknown): CasinoHotelPackagesSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.properties)) {
    return { properties: c.properties as RevenueDirectoryEntry[] };
  }
  return { properties: DEFAULT_PROPERTIES };
}

export async function loadCasinoHotelPackages(
  config: CasinoHotelPackagesSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseCasinoHotelPackagesSourceConfig(config);
  return loadRevenueDirectory(parsed.properties ?? DEFAULT_PROPERTIES, '#casino-hotel-package');
}
