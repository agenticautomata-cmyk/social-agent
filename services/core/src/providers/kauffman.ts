export type KauffmanSourceConfig = {
  apiUrl?: string;
  horizonDays?: number;
  limit?: number;
};

export type NormalizedKauffmanEvent = {
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

type TnewPerformance = {
  id?: number;
  performanceDate?: string;
  iso8601DateString?: string;
  displayDate?: string;
  displayTime?: string;
  performanceTitle?: string;
  actionUrl?: string;
  isPerformanceVisible?: boolean;
};

type TnewProduction = {
  productionSeasonId?: string;
  productionTitle?: string;
  description?: string;
  productionSeasonActionUrl?: string;
  actionUrl?: string;
  performances?: TnewPerformance[];
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_API_URL = 'https://tickets.kauffmancenter.org/api/products/productionseasons';

const KNOWN_VENUES = [
  'Helzberg Hall',
  'Muriel Kauffman Theatre',
  'Muriel Kauffman Theater',
  'Brandmeyer Great Hall',
  'Harriman-Jewell Series',
];

export function parseKauffmanSourceConfig(raw: unknown): KauffmanSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    apiUrl: typeof c.apiUrl === 'string' ? c.apiUrl : DEFAULT_API_URL,
    horizonDays: typeof c.horizonDays === 'number' ? c.horizonDays : 90,
    limit: typeof c.limit === 'number' ? c.limit : 50,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIsoDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function visiblePerformances(production: TnewProduction): TnewPerformance[] {
  return (production.performances ?? []).filter((p) => p.isPerformanceVisible !== false);
}

function titleFromProduction(production: TnewProduction): string {
  const fromTitle = stripHtml(production.productionTitle ?? '');
  if (fromTitle) return fromTitle;
  const perfs = visiblePerformances(production);
  return perfs[0]?.performanceTitle?.trim() || '(untitled kauffman event)';
}

function venueFromDescription(description: string | undefined): string | null {
  if (!description) return null;
  for (const venue of KNOWN_VENUES) {
    if (description.includes(venue)) return venue;
  }
  const text = stripHtml(description);
  const parts = text.split(/\n|\. /).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (/hall|theatre|theater|gallery|center/i.test(part) && part.length < 80) {
      return part;
    }
  }
  return null;
}

function buildLocationClues(venue: string | null): string[] {
  const clues = ['kauffman center'];
  if (venue) clues.push(venue.toLowerCase());
  return clues;
}

function overviewUrl(production: TnewProduction): string {
  const id = production.productionSeasonId;
  if (id) return `https://tickets.kauffmancenter.org/overview/${id}`;
  return (
    production.productionSeasonActionUrl ??
    production.actionUrl ??
    'https://www.kauffmancenter.org/events/'
  );
}

function buildBody(production: TnewProduction, venue: string | null, nextPerf: TnewPerformance | null): string {
  const parts: string[] = [];
  if (venue) parts.push(`Venue: ${venue}`);
  if (nextPerf?.displayDate) parts.push(`Date: ${nextPerf.displayDate}`);
  if (nextPerf?.displayTime) parts.push(`Time: ${nextPerf.displayTime}`);
  const desc = stripHtml(production.description ?? '');
  if (desc) parts.push(desc.slice(0, 500));
  return parts.join('. ');
}

export function normalizeKauffmanProduction(production: TnewProduction): NormalizedKauffmanEvent | null {
  const externalId = production.productionSeasonId;
  if (!externalId) return null;

  const perfs = visiblePerformances(production).sort((a, b) => {
    const aTime = parseIsoDate(a.iso8601DateString ?? a.performanceDate)?.getTime() ?? 0;
    const bTime = parseIsoDate(b.iso8601DateString ?? b.performanceDate)?.getTime() ?? 0;
    return aTime - bTime;
  });
  const nextPerf = perfs[0] ?? null;
  const venue = venueFromDescription(production.description);
  const eventStartsAt = parseIsoDate(nextPerf?.iso8601DateString ?? nextPerf?.performanceDate);
  const publishedAt = eventStartsAt ?? new Date();

  return {
    externalId,
    title: titleFromProduction(production),
    body: buildBody(production, venue, nextPerf),
    url: overviewUrl(production),
    publishedAt,
    eventStartsAt,
    eventEndsAt: null,
    venue,
    contentType: 'performance',
    locationClues: buildLocationClues(venue),
    locationHint: venue ?? 'kauffman center',
  };
}

export async function fetchKauffmanEvents(
  config: KauffmanSourceConfig,
): Promise<NormalizedKauffmanEvent[]> {
  const apiUrl = config.apiUrl ?? DEFAULT_API_URL;
  const horizonDays = Math.min(config.horizonDays ?? 90, 180);
  const limit = Math.min(config.limit ?? 50, 100);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(today.getDate() + horizonDays);

  const payload = {
    startDate: formatDateYmd(today),
    endDate: formatDateYmd(end),
  };

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`kauffman events fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('kauffman events response was not an array');
  }

  return (data as TnewProduction[])
    .map(normalizeKauffmanProduction)
    .filter((e): e is NormalizedKauffmanEvent => e !== null)
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
    .slice(0, limit);
}

export async function loadKauffmanEvents(
  config: KauffmanSourceConfig,
): Promise<NormalizedKauffmanEvent[]> {
  return fetchKauffmanEvents(config);
}
