import {
  loadCharityDirectory,
  type CharityDirectoryEntry,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type RoyalsCharityEventsSourceConfig = {
  events?: CharityDirectoryEntry[];
};

const DEFAULT_EVENTS: CharityDirectoryEntry[] = [
  {
    slug: 'royals-charity-auction',
    title: 'Royals Charity Auction — player memorabilia benefiting Kansas City nonprofits',
    body: 'Kansas City Royals charity auction featuring signed memorabilia and VIP experiences supporting local community organizations.',
    celebrityNames: ['Bobby Witt Jr.', 'Salvador Perez', 'George Brett'],
    nonprofit: 'Kansas City Royals Charities',
    venue: 'Kauffman Stadium',
    address: '1 Royal Way, Kansas City, MO 64129',
    neighborhood: 'east kansas city',
    sourceUrl: 'https://www.mlb.com/royals/community',
    category: 'sports_celebrity_event',
  },
  {
    slug: 'royals-community-cleanup',
    title: 'Royals Community Cleanup Day',
    body: 'Royals players and front office staff volunteer event supporting Kansas City neighborhood nonprofits.',
    celebrityNames: ['Bobby Witt Jr.', 'Salvador Perez'],
    nonprofit: 'Kansas City Royals Charities',
    venue: 'Kansas City metro',
    address: 'Kansas City, MO',
    neighborhood: 'kansas city',
    sourceUrl: 'https://www.mlb.com/royals/community',
    category: 'charity_event',
  },
  {
    slug: 'royals-foundation-gala',
    title: 'Kansas City Royals Foundation Gala',
    body: 'Annual gala supporting Royals community programs with player appearances and live auction.',
    celebrityNames: ['George Brett'],
    nonprofit: 'Kansas City Royals Charities',
    venue: 'Kauffman Stadium',
    address: '1 Royal Way, Kansas City, MO 64129',
    neighborhood: 'east kansas city',
    sourceUrl: 'https://www.mlb.com/royals/community',
    category: 'gala',
    eventDate: '2026-01-24',
  },
];

export function parseRoyalsCharityEventsSourceConfig(raw: unknown): RoyalsCharityEventsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.events)) return { events: c.events as CharityDirectoryEntry[] };
  return { events: DEFAULT_EVENTS };
}

export async function loadRoyalsCharityEvents(
  config: RoyalsCharityEventsSourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseRoyalsCharityEventsSourceConfig(config);
  return loadCharityDirectory(parsed.events ?? DEFAULT_EVENTS, '#royals-charity');
}
