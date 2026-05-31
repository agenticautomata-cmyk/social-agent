import {
  loadCharityDirectory,
  type CharityDirectoryEntry,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type ChiefsCharityEventsSourceConfig = {
  events?: CharityDirectoryEntry[];
};

const DEFAULT_EVENTS: CharityDirectoryEntry[] = [
  {
    slug: 'chiefs-charity-game',
    title: 'Chiefs Charity Game — preseason benefit for Kansas City community',
    body: 'Annual Kansas City Chiefs preseason charity game supporting local nonprofits with player appearances and community engagement.',
    celebrityNames: ['Patrick Mahomes', 'Travis Kelce', 'Andy Reid'],
    nonprofit: 'Kansas City Chiefs Foundation',
    venue: 'GEHA Field at Arrowhead Stadium',
    address: '1 Arrowhead Drive, Kansas City, MO 64129',
    neighborhood: 'east kansas city',
    sourceUrl: 'https://www.chiefscharitygame.com/',
    ticketUrl: 'https://www.chiefscharitygame.com/',
    category: 'sports_celebrity_event',
    eventDate: '2026-08-15',
  },
  {
    slug: 'chiefs-red-friday',
    title: 'Red Friday — Chiefs Kingdom charity initiative',
    body: 'Chiefs community giving campaign supporting Kansas City-area charities with player and alumni appearances.',
    celebrityNames: ['Patrick Mahomes', 'Travis Kelce'],
    nonprofit: 'Kansas City Chiefs Foundation',
    venue: 'Kansas City metro',
    address: 'Kansas City, MO',
    neighborhood: 'kansas city',
    sourceUrl: 'https://www.chiefs.com/community/',
    category: 'sports_celebrity_event',
  },
  {
    slug: 'chiefs-community-volunteer',
    title: 'Chiefs Community Volunteer Day',
    body: 'Chiefs players and staff community service events supporting Kansas City nonprofits.',
    nonprofit: 'Kansas City Chiefs Foundation',
    venue: 'Kansas City metro',
    address: 'Kansas City, MO',
    neighborhood: 'kansas city',
    sourceUrl: 'https://www.chiefs.com/community/',
    category: 'charity_event',
  },
];

export function parseChiefsCharityEventsSourceConfig(raw: unknown): ChiefsCharityEventsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.events)) return { events: c.events as CharityDirectoryEntry[] };
  return { events: DEFAULT_EVENTS };
}

export async function loadChiefsCharityEvents(
  config: ChiefsCharityEventsSourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseChiefsCharityEventsSourceConfig(config);
  return loadCharityDirectory(parsed.events ?? DEFAULT_EVENTS, '#chiefs-charity');
}
