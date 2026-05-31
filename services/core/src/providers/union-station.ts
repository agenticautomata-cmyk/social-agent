export type UnionStationSourceConfig = {
  apiUrl?: string;
  horizonDays?: number;
  limit?: number;
};

export type NormalizedUnionStationEvent = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  venue: string | null;
  contentType: string;
  locationClues: string[];
  locationHint: string | null;
};

type NavEventSession = {
  start_datetime?: string;
  end_datetime?: string;
};

type NavEvent = {
  id?: string;
  name?: string;
  url?: string;
  location?: string;
  sessions?: boolean | {
    event_session?: {
      _data?: NavEventSession[];
    };
  };
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_API_URL = 'https://unionstation.org/wp-json/us/v1/nav-events';

export function parseUnionStationSourceConfig(raw: unknown): UnionStationSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    apiUrl: typeof c.apiUrl === 'string' ? c.apiUrl : DEFAULT_API_URL,
    horizonDays: typeof c.horizonDays === 'number' ? c.horizonDays : 14,
    limit: typeof c.limit === 'number' ? c.limit : 50,
  };
}

function externalIdFromEvent(event: NavEvent): string {
  if (event.id) return event.id;
  try {
    const path = new URL(event.url ?? '').pathname.replace(/^\/+|\/+$/g, '');
    return path || (event.url ?? event.name ?? 'unknown');
  } catch {
    return event.url ?? event.name ?? 'unknown';
  }
}

function sessionsFromEvent(event: NavEvent): NavEventSession[] {
  const sessions = event.sessions;
  if (!sessions || sessions === true || typeof sessions !== 'object') return [];
  return sessions.event_session?._data ?? [];
}

function parseIsoDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildLocationClues(_title: string, venue: string | null): string[] {
  const result = ['union station'];
  if (venue) result.push(venue.toLowerCase());
  return result;
}

function buildBody(event: NavEvent, sessions: NavEventSession[]): string {
  const parts: string[] = [];
  if (event.location) parts.push(`Venue: ${event.location}`);
  if (sessions.length > 0) {
    const next = sessions[0]!;
    if (next.start_datetime) parts.push(`Starts: ${next.start_datetime}`);
    if (next.end_datetime) parts.push(`Ends: ${next.end_datetime}`);
  }
  return parts.join('. ');
}

export function normalizeUnionStationEvent(
  event: NavEvent,
  sessions: NavEventSession[],
): NormalizedUnionStationEvent {
  const title = (event.name ?? '').trim() || '(untitled union station event)';
  const url = event.url ?? '';
  const venue = event.location?.trim() || null;
  const sortedSessions = [...sessions].sort((a, b) => {
    const aStart = parseIsoDate(a.start_datetime)?.getTime() ?? 0;
    const bStart = parseIsoDate(b.start_datetime)?.getTime() ?? 0;
    return aStart - bStart;
  });
  const firstSession = sortedSessions[0];
  const publishedAt =
    parseIsoDate(firstSession?.start_datetime) ?? new Date();

  return {
    externalId: externalIdFromEvent(event),
    title,
    body: buildBody(event, sortedSessions),
    url,
    publishedAt,
    eventStartsAt: parseIsoDate(firstSession?.start_datetime),
    eventEndsAt: parseIsoDate(firstSession?.end_datetime),
    venue,
    contentType: 'event',
    locationClues: buildLocationClues(title, venue),
    locationHint: venue ?? 'union station',
  };
}

async function fetchNavEventsForDate(apiUrl: string, date: string): Promise<NavEvent[]> {
  const url = new URL(apiUrl);
  url.searchParams.set('date', date);

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`union station events fetch failed for ${date}: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`union station events response for ${date} was not an array`);
  }
  return data as NavEvent[];
}

export async function fetchUnionStationEvents(
  config: UnionStationSourceConfig,
): Promise<NormalizedUnionStationEvent[]> {
  const apiUrl = config.apiUrl ?? DEFAULT_API_URL;
  const horizonDays = Math.min(config.horizonDays ?? 14, 30);
  const limit = Math.min(config.limit ?? 50, 100);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const merged = new Map<string, { event: NavEvent; sessions: NavEventSession[] }>();

  for (let offset = 0; offset < horizonDays; offset++) {
    const day = new Date(today);
    day.setDate(today.getDate() + offset);
    const dateStr = formatDateYmd(day);
    const events = await fetchNavEventsForDate(apiUrl, dateStr);

    for (const event of events) {
      const key = externalIdFromEvent(event);
      const daySessions = sessionsFromEvent(event);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { event, sessions: daySessions });
        continue;
      }
      existing.sessions.push(...daySessions);
    }
  }

  return [...merged.values()]
    .map(({ event, sessions }) => normalizeUnionStationEvent(event, sessions))
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
    .slice(0, limit);
}

export async function loadUnionStationEvents(
  config: UnionStationSourceConfig,
): Promise<NormalizedUnionStationEvent[]> {
  return fetchUnionStationEvents(config);
}
