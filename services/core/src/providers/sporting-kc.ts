export type SportingKcSourceConfig = {
  apiUrl?: string;
  clubOptaId?: number;
  horizonDays?: number;
  limit?: number;
  maxPages?: number;
};

export type NormalizedSportingKcMatch = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  eventStartsAt: Date;
  opponent: string;
  homeAway: 'home' | 'away';
  venue: string | null;
  contentType: string;
  locationClues: string[];
  locationHint: string | null;
};

type ForgeMatchFields = {
  optaId?: number;
  sportecId?: string;
  matchDateTime?: string;
  homeClubOptaId?: number;
  awayClubOptaId?: number;
  venueOptaId?: number;
  appleStreamURL?: string;
  leagueMatchTitle?: string;
};

type ForgeMatchItem = {
  slug?: string;
  selfUrl?: string;
  fields?: ForgeMatchFields;
};

type ForgeMatchesResponse = {
  items?: ForgeMatchItem[];
  pagination?: { nextUrl?: string | null };
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_API_URL = 'https://dapi.sportingkc.com/v2/content/en-us/matches';
const DEFAULT_CLUB_OPTA_ID = 421;
const HOME_VENUE = "Children's Mercy Park";

export function parseSportingKcSourceConfig(raw: unknown): SportingKcSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    apiUrl: typeof c.apiUrl === 'string' ? c.apiUrl : DEFAULT_API_URL,
    clubOptaId: typeof c.clubOptaId === 'number' ? c.clubOptaId : DEFAULT_CLUB_OPTA_ID,
    horizonDays: typeof c.horizonDays === 'number' ? c.horizonDays : 180,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    maxPages: typeof c.maxPages === 'number' ? c.maxPages : 10,
  };
}

function parseIsoDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function titleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function opponentFromAppleUrl(url: string | undefined, clubOptaId: number, homeClubOptaId?: number): string | null {
  if (!url) return null;
  const m = url.match(/sporting-event\/([^/]+)\//i);
  if (!m?.[1]) return null;
  const parts = m[1].split('-vs-');
  if (parts.length !== 2) return null;
  const skcSlug = 'sporting-kansas-city';
  const opponentSlug = parts[0]?.includes(skcSlug) ? parts[1] : parts[0];
  if (!opponentSlug) return null;
  const name = titleCaseWords(opponentSlug.replace(/-/g, ' '));
  if (homeClubOptaId === clubOptaId) return name;
  return name;
}

function opponentFromSlug(slug: string | undefined, isHome: boolean): string | null {
  if (!slug) return null;
  const base = slug.replace(/-\d{2}-\d{2}-\d{4}$/, '');
  const vsIdx = base.indexOf('vs');
  if (vsIdx === -1) return null;
  const left = base.slice(0, vsIdx);
  const right = base.slice(vsIdx + 2);
  const abbrev = isHome ? right : left;
  if (!abbrev) return null;
  return abbrev.toUpperCase();
}

function scheduleUrl(matchDate: Date): string {
  const ymd = matchDate.toISOString().slice(0, 10);
  return `https://www.sportingkc.com/schedule/#competition=all&date=${ymd}`;
}

function buildLocationClues(homeAway: 'home' | 'away', venue: string | null): string[] {
  const clues = ['sporting kc', 'kansas city'];
  if (homeAway === 'home') clues.unshift('childrens mercy park');
  if (venue) clues.push(venue.toLowerCase());
  return [...new Set(clues)];
}

function buildTitle(opponent: string, homeAway: 'home' | 'away'): string {
  if (homeAway === 'home') return `Sporting KC vs ${opponent}`;
  return `Sporting KC at ${opponent}`;
}

function buildBody(
  opponent: string,
  homeAway: 'home' | 'away',
  venue: string | null,
  matchDate: Date,
  leagueTitle: string | null,
): string {
  const parts = [
    `Opponent: ${opponent}`,
    `Home/Away: ${homeAway}`,
    venue ? `Venue: ${venue}` : null,
    `Kickoff: ${matchDate.toISOString()}`,
    leagueTitle ? `Competition: ${leagueTitle}` : null,
  ];
  return parts.filter(Boolean).join('. ');
}

export function normalizeSportingKcMatch(
  item: ForgeMatchItem,
  clubOptaId: number,
): NormalizedSportingKcMatch | null {
  const fields = item.fields;
  if (!fields?.optaId || !fields.matchDateTime) return null;

  const isHome = fields.homeClubOptaId === clubOptaId;
  const isAway = fields.awayClubOptaId === clubOptaId;
  if (!isHome && !isAway) return null;

  const homeAway: 'home' | 'away' = isHome ? 'home' : 'away';
  const eventStartsAt = parseIsoDate(fields.matchDateTime);
  if (!eventStartsAt) return null;

  const opponent =
    opponentFromAppleUrl(fields.appleStreamURL, clubOptaId, fields.homeClubOptaId) ??
    opponentFromSlug(item.slug, isHome) ??
    'TBD';

  const venue = isHome ? HOME_VENUE : null;
  const publishedAt = eventStartsAt;
  const url = fields.appleStreamURL || scheduleUrl(eventStartsAt);

  return {
    externalId: String(fields.optaId),
    title: buildTitle(opponent, homeAway),
    body: buildBody(opponent, homeAway, venue, eventStartsAt, fields.leagueMatchTitle ?? null),
    url,
    publishedAt,
    eventStartsAt,
    opponent,
    homeAway,
    venue,
    contentType: 'match',
    locationClues: buildLocationClues(homeAway, venue),
    locationHint: venue ?? 'kansas city',
  };
}

async function fetchMatchesPage(url: string): Promise<ForgeMatchesResponse> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`sporting kc matches fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ForgeMatchesResponse;
}

export async function fetchSportingKcMatches(
  config: SportingKcSourceConfig,
): Promise<NormalizedSportingKcMatch[]> {
  const apiUrl = config.apiUrl ?? DEFAULT_API_URL;
  const clubOptaId = config.clubOptaId ?? DEFAULT_CLUB_OPTA_ID;
  const horizonDays = Math.min(config.horizonDays ?? 180, 365);
  const limit = Math.min(config.limit ?? 50, 100);
  const maxPages = Math.min(config.maxPages ?? 10, 20);

  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

  const merged = new Map<string, NormalizedSportingKcMatch>();
  let url: string | null = apiUrl;
  let pages = 0;

  while (url && pages < maxPages) {
    const page = await fetchMatchesPage(url);
    const items = page.items ?? [];
    pages++;

    let pageMin: Date | null = null;
    let pageMax: Date | null = null;

    for (const item of items) {
      const matchDate = parseIsoDate(item.fields?.matchDateTime);
      if (matchDate) {
        if (!pageMin || matchDate < pageMin) pageMin = matchDate;
        if (!pageMax || matchDate > pageMax) pageMax = matchDate;
      }

      const normalized = normalizeSportingKcMatch(item, clubOptaId);
      if (!normalized) continue;
      if (normalized.eventStartsAt < now || normalized.eventStartsAt > horizonEnd) continue;
      merged.set(normalized.externalId, normalized);
    }

    if (pageMin && pageMin < now) break;
    url = page.pagination?.nextUrl ?? null;
  }

  return [...merged.values()]
    .sort((a, b) => a.eventStartsAt.getTime() - b.eventStartsAt.getTime())
    .slice(0, limit);
}

export async function loadSportingKcMatches(
  config: SportingKcSourceConfig,
): Promise<NormalizedSportingKcMatch[]> {
  return fetchSportingKcMatches(config);
}
