import {
  loadRevenueDirectory,
  type NormalizedRevenueOpportunity,
  type RevenueDirectoryEntry,
} from './revenue-alignment-shared.js';

export type SpaPackagesKcSourceConfig = {
  spas?: RevenueDirectoryEntry[];
};

const DEFAULT_SPAS: RevenueDirectoryEntry[] = [
  {
    slug: 'the-elms-spa',
    businessName: 'The Elms Hotel & Spa',
    title: 'The Elms Hotel & Spa — luxury wellness packages & romantic getaways',
    venue: 'The Elms Hotel & Spa',
    address: '401 Regent Avenue, Excelsior Springs, MO 64024',
    neighborhood: 'excelsior springs',
    website: 'https://www.elmsresort.com/spa',
    description:
      'Historic mineral springs resort spa with day packages, couples massage, and overnight wellness getaway promotions.',
    category: 'spa_package',
  },
  {
    slug: 'spa-on-penn',
    businessName: 'Spa on Penn',
    title: 'Spa on Penn — Plaza day spa packages & couples treatments',
    venue: 'Spa on Penn',
    address: '4141 Pennsylvania Avenue, Kansas City, MO 64111',
    neighborhood: 'plaza',
    website: 'https://www.spaonpenn.com/',
    description:
      'Full-service day spa on the Country Club Plaza offering massage packages, facials, and couples spa day promotions.',
    category: 'spa_package',
  },
  {
    slug: 'amore-spa',
    businessName: 'Amore Spa',
    title: 'Amore Spa — luxury massage & wellness packages',
    venue: 'Amore Spa',
    address: '7200 W 75th Street, Overland Park, KS 66204',
    neighborhood: 'overland park',
    website: 'https://www.amorespa.com/',
    description:
      'Upscale spa with couples massage packages, wellness memberships, and seasonal spa day promotions in Johnson County.',
    category: 'spa_package',
  },
  {
    slug: 'loews-spa',
    businessName: 'The Spa at Loews Kansas City',
    title: 'The Spa at Loews — hotel spa packages & couples treatments',
    venue: 'The Spa at Loews Kansas City',
    address: '1515 Wyandotte Street, Kansas City, MO 64108',
    neighborhood: 'power and light',
    website: 'https://www.loewshotels.com/kansas-city-hotel/spa',
    description:
      'Hotel spa with massage, body treatments, and package deals bundled with Loews Kansas City overnight stays.',
    category: 'spa_package',
  },
  {
    slug: 'raphael-spa',
    businessName: 'The Spa at The Raphael',
    title: 'The Spa at The Raphael — Plaza luxury spa packages',
    venue: 'The Spa at The Raphael',
    address: '325 Ward Parkway, Kansas City, MO 64112',
    neighborhood: 'plaza',
    website: 'https://www.raphaelhotels.com/spa',
    description:
      'Boutique hotel spa on the Plaza with couples packages, facials, and romantic spa day add-ons for hotel guests.',
    category: 'spa_package',
  },
];

export function parseSpaPackagesKcSourceConfig(raw: unknown): SpaPackagesKcSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.spas)) {
    return { spas: c.spas as RevenueDirectoryEntry[] };
  }
  return { spas: DEFAULT_SPAS };
}

export async function loadSpaPackagesKc(
  config: SpaPackagesKcSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseSpaPackagesKcSourceConfig(config);
  return loadRevenueDirectory(parsed.spas ?? DEFAULT_SPAS, '#spa-package');
}
