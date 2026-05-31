import {
  loadCharityDirectory,
  type CharityDirectoryEntry,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type SportingKcCharitySourceConfig = {
  events?: CharityDirectoryEntry[];
};

const DEFAULT_EVENTS: CharityDirectoryEntry[] = [
  {
    slug: 'sporting-foundation-gala',
    title: 'Sporting KC Foundation Gala',
    body: 'Annual Sporting Kansas City foundation gala supporting youth soccer and community programs in KC.',
    nonprofit: 'Sporting KC Foundation',
    venue: "Children's Mercy Park",
    address: '1 Sporting Way, Kansas City, KS 66111',
    neighborhood: 'kansas city kansas',
    sourceUrl: 'https://www.sportingkc.com/community',
    category: 'gala',
    eventDate: '2026-02-22',
  },
  {
    slug: 'sporting-community-cup',
    title: 'Sporting KC Community Cup — charity match',
    body: 'Charity exhibition match benefiting Kansas City youth soccer programs with Sporting KC players.',
    nonprofit: 'Sporting KC Foundation',
    venue: "Children's Mercy Park",
    address: '1 Sporting Way, Kansas City, KS 66111',
    neighborhood: 'kansas city kansas',
    sourceUrl: 'https://www.sportingkc.com/community',
    category: 'sports_celebrity_event',
  },
  {
    slug: 'sporting-red-friday-youth',
    title: 'Sporting KC Youth Clinic & Charity Drive',
    body: 'Player-led youth clinic and charity supply drive supporting KC metro nonprofits.',
    nonprofit: 'Sporting KC Foundation',
    venue: 'Kansas City metro',
    address: 'Kansas City, MO',
    neighborhood: 'kansas city',
    sourceUrl: 'https://www.sportingkc.com/community',
    category: 'charity_event',
  },
];

export function parseSportingKcCharitySourceConfig(raw: unknown): SportingKcCharitySourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.events)) return { events: c.events as CharityDirectoryEntry[] };
  return { events: DEFAULT_EVENTS };
}

export async function loadSportingKcCharityEvents(
  config: SportingKcCharitySourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseSportingKcCharitySourceConfig(config);
  return loadCharityDirectory(parsed.events ?? DEFAULT_EVENTS, '#sporting-kc-charity');
}
