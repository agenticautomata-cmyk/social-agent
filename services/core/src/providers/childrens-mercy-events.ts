import {
  loadCharityDirectory,
  type CharityDirectoryEntry,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type ChildrensMercyEventsSourceConfig = {
  events?: CharityDirectoryEntry[];
};

const DEFAULT_EVENTS: CharityDirectoryEntry[] = [
  {
    slug: 'big-slick-benefit',
    title: "Big Slick Celebrity Weekend — flagship Children's Mercy fundraiser",
    body: "Annual celebrity comedy and sports weekend raising millions for Children's Mercy Kansas City, hosted by Paul Rudd, Jason Sudeikis, Eric Stonestreet, Rob Riggle, and David Koechner.",
    celebrityNames: ['Paul Rudd', 'Jason Sudeikis', 'Eric Stonestreet', 'Rob Riggle', 'David Koechner'],
    nonprofit: "Children's Mercy Kansas City",
    venue: 'Kansas City Power & Light District',
    address: 'Kansas City, MO',
    neighborhood: 'power and light',
    sourceUrl: 'https://www.bigslickkc.org/',
    ticketUrl: 'https://www.bigslickkc.org/',
    category: 'fundraiser',
    eventDate: '2026-06-06',
  },
  {
    slug: 'cm-gala-of-stars',
    title: "Children's Mercy Gala of Stars",
    body: "Premier black-tie gala supporting Children's Mercy Hospital programs with celebrity guests and live auction.",
    nonprofit: "Children's Mercy Kansas City",
    venue: 'Kansas City Convention Center',
    address: '301 West 13th Street, Kansas City, MO 64105',
    neighborhood: 'downtown',
    sourceUrl: 'https://www.childrensmercy.org/',
    category: 'gala',
    eventDate: '2026-03-14',
  },
  {
    slug: 'cm-corporate-golf',
    title: "Children's Mercy Corporate Golf Classic",
    body: 'Charity golf tournament benefiting pediatric care at Children\'s Mercy Kansas City.',
    nonprofit: "Children's Mercy Kansas City",
    venue: 'Loch Lloyd Country Club',
    address: 'Loch Lloyd, MO',
    neighborhood: 'south metro',
    sourceUrl: 'https://www.childrensmercy.org/',
    category: 'charity_event',
    eventDate: '2026-05-18',
  },
];

export function parseChildrensMercyEventsSourceConfig(raw: unknown): ChildrensMercyEventsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.events)) return { events: c.events as CharityDirectoryEntry[] };
  return { events: DEFAULT_EVENTS };
}

export async function loadChildrensMercyEvents(
  config: ChildrensMercyEventsSourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseChildrensMercyEventsSourceConfig(config);
  return loadCharityDirectory(parsed.events ?? DEFAULT_EVENTS, '#childrens-mercy-event');
}
