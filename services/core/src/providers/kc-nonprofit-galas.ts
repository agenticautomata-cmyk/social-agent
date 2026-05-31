import {
  loadCharityDirectory,
  type CharityDirectoryEntry,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type KcNonprofitGalasSourceConfig = {
  events?: CharityDirectoryEntry[];
};

const DEFAULT_EVENTS: CharityDirectoryEntry[] = [
  {
    slug: 'united-way-gala',
    title: 'United Way of Greater Kansas City Gala',
    body: 'Annual United Way gala with community leaders and celebrity guests supporting KC metro nonprofits.',
    nonprofit: 'United Way of Greater Kansas City',
    venue: 'Kansas City Convention Center',
    address: '301 West 13th Street, Kansas City, MO 64105',
    neighborhood: 'downtown',
    sourceUrl: 'https://www.unitedwaygkc.org/',
    category: 'gala',
    eventDate: '2026-04-12',
  },
  {
    slug: 'kc-ballet-gala',
    title: 'Kansas City Ballet Nutcracker Gala',
    body: 'Black-tie gala supporting Kansas City Ballet with celebrity guests and live performance.',
    nonprofit: 'Kansas City Ballet',
    venue: 'Kauffman Center for the Performing Arts',
    address: '1601 Broadway Boulevard, Kansas City, MO 64108',
    neighborhood: 'downtown',
    sourceUrl: 'https://www.kcballet.org/',
    category: 'gala',
    eventDate: '2026-11-21',
  },
  {
    slug: 'symphony-gala',
    title: 'Kansas City Symphony Gala',
    body: 'Annual symphony gala with celebrity performers and red carpet benefiting KC Symphony programs.',
    nonprofit: 'Kansas City Symphony',
    venue: 'Kauffman Center for the Performing Arts',
    address: '1601 Broadway Boulevard, Kansas City, MO 64108',
    neighborhood: 'downtown',
    sourceUrl: 'https://www.kcsymphony.org/',
    category: 'gala',
    eventDate: '2026-09-19',
  },
  {
    slug: 'ha-loves-kc',
    title: 'H&R Block Foundation Loves KC Benefit',
    body: 'Major Kansas City corporate charity benefit supporting metro nonprofits with celebrity hosts.',
    nonprofit: 'H&R Block Foundation',
    venue: 'Kansas City metro',
    address: 'Kansas City, MO',
    neighborhood: 'downtown',
    sourceUrl: 'https://www.hrblock.com/',
    category: 'fundraiser',
  },
  {
    slug: 'red-cross-gala',
    title: 'American Red Cross Kansas City Heroes Gala',
    body: 'Red carpet gala honoring local heroes and raising funds for American Red Cross Greater Kansas City Chapter.',
    nonprofit: 'American Red Cross Greater Kansas City',
    venue: 'Kansas City Convention Center',
    address: '301 West 13th Street, Kansas City, MO 64105',
    neighborhood: 'downtown',
    sourceUrl: 'https://www.redcross.org/local/kansas/missouri.html',
    category: 'gala',
    eventDate: '2026-03-28',
  },
];

export function parseKcNonprofitGalasSourceConfig(raw: unknown): KcNonprofitGalasSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.events)) return { events: c.events as CharityDirectoryEntry[] };
  return { events: DEFAULT_EVENTS };
}

export async function loadKcNonprofitGalas(
  config: KcNonprofitGalasSourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseKcNonprofitGalasSourceConfig(config);
  return loadCharityDirectory(parsed.events ?? DEFAULT_EVENTS, '#nonprofit-gala');
}
