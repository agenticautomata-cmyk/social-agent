import {
  loadCharityDirectory,
  type CharityDirectoryEntry,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type KcCurrentCharitySourceConfig = {
  events?: CharityDirectoryEntry[];
};

const DEFAULT_EVENTS: CharityDirectoryEntry[] = [
  {
    slug: 'kc-current-pride-charity',
    title: 'KC Current Pride Night — charity partnership event',
    body: 'KC Current Pride Night supporting LGBTQ+ community nonprofits with player meet-and-greet.',
    nonprofit: 'KC Current Community',
    venue: 'CPKC Stadium',
    address: '1600 Genessee Street, Kansas City, MO 64102',
    neighborhood: 'west bottoms',
    sourceUrl: 'https://www.kccurrent.com/community',
    category: 'sports_celebrity_event',
  },
  {
    slug: 'kc-current-youth-clinic',
    title: 'KC Current Youth Soccer Clinic — community charity event',
    body: 'Player-led youth clinic benefiting Kansas City girls soccer programs and community nonprofits.',
    nonprofit: 'KC Current Community',
    venue: 'CPKC Stadium',
    address: '1600 Genessee Street, Kansas City, MO 64102',
    neighborhood: 'west bottoms',
    sourceUrl: 'https://www.kccurrent.com/community',
    category: 'charity_event',
  },
  {
    slug: 'kc-current-foundation-auction',
    title: 'KC Current Foundation Charity Auction',
    body: 'Online charity auction featuring match-worn kits and VIP experiences benefiting KC Current community programs.',
    nonprofit: 'KC Current Community',
    venue: 'CPKC Stadium',
    address: '1600 Genessee Street, Kansas City, MO 64102',
    neighborhood: 'west bottoms',
    sourceUrl: 'https://www.kccurrent.com/community',
    category: 'fundraiser',
  },
];

export function parseKcCurrentCharitySourceConfig(raw: unknown): KcCurrentCharitySourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.events)) return { events: c.events as CharityDirectoryEntry[] };
  return { events: DEFAULT_EVENTS };
}

export async function loadKcCurrentCharityEvents(
  config: KcCurrentCharitySourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseKcCurrentCharitySourceConfig(config);
  return loadCharityDirectory(parsed.events ?? DEFAULT_EVENTS, '#kc-current-charity');
}
