export type FirstFridaysSourceConfig = {
  horizonDays?: number;
  /** Inclusive month range for First Fridays (1-indexed) */
  seasonStartMonth?: number;
  seasonEndMonth?: number;
  eventUrl?: string;
};

export type NormalizedFirstFridaysEvent = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  venue: string | null;
  address: string | null;
  neighborhood: string | null;
  freeEventFlag: boolean;
  eventCategory: string;
  locationClues: string[];
  locationHint: string | null;
};

const DEFAULT_EVENT_URL = 'https://kccrossroads.org/first-fridays/';
const CROSSROADS_ADDRESS = 'Crossroads Arts District, 19th & Main Streets, Kansas City, MO';

export function parseFirstFridaysSourceConfig(raw: unknown): FirstFridaysSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    horizonDays: typeof c.horizonDays === 'number' ? c.horizonDays : 120,
    seasonStartMonth: typeof c.seasonStartMonth === 'number' ? c.seasonStartMonth : 4,
    seasonEndMonth: typeof c.seasonEndMonth === 'number' ? c.seasonEndMonth : 10,
    eventUrl: typeof c.eventUrl === 'string' ? c.eventUrl : DEFAULT_EVENT_URL,
  };
}

function firstFridayOfMonth(year: number, month: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === 5) {
      return new Date(Date.UTC(year, month - 1, d.getUTCDate(), 17, 0, 0));
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function generateFirstFridaysEvents(config: FirstFridaysSourceConfig): NormalizedFirstFridaysEvent[] {
  const horizonDays = config.horizonDays ?? 120;
  const seasonStart = config.seasonStartMonth ?? 4;
  const seasonEnd = config.seasonEndMonth ?? 10;
  const eventUrl = config.eventUrl ?? DEFAULT_EVENT_URL;

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const events: NormalizedFirstFridaysEvent[] = [];

  const startYear = now.getUTCFullYear();
  const endYear = horizonEnd.getUTCFullYear();

  for (let year = startYear; year <= endYear; year++) {
    for (let month = seasonStart; month <= seasonEnd; month++) {
      const ff = firstFridayOfMonth(year, month);
      if (!ff) continue;

      const eventEndsAt = new Date(ff.getTime() + 4 * 60 * 60 * 1000);
      if (ff < now || ff > horizonEnd) continue;

      const monthLabel = formatMonthYear(ff);
      const slug = `first-fridays-${year}-${String(month).padStart(2, '0')}-${String(ff.getUTCDate()).padStart(2, '0')}`;

      events.push({
        externalId: slug,
        title: `First Fridays in the Crossroads — ${monthLabel}`,
        body:
          'Crossroads First Fridays is Kansas City\'s free monthly art walk. Galleries, studios, and shops open late with exhibitions, food trucks, and street energy along 19th Street and throughout the Crossroads Arts District. Free admission.',
        url: `${eventUrl}#${slug}`,
        publishedAt: now,
        eventStartsAt: ff,
        eventEndsAt,
        venue: 'Crossroads Arts District',
        address: CROSSROADS_ADDRESS,
        neighborhood: 'crossroads',
        freeEventFlag: true,
        eventCategory: 'first_friday',
        locationClues: ['crossroads', '19th and main', 'kansas city', 'first fridays', 'free'],
        locationHint: 'crossroads',
      });
    }
  }

  return events.sort((a, b) => {
    const at = a.eventStartsAt?.getTime() ?? 0;
    const bt = b.eventStartsAt?.getTime() ?? 0;
    return at - bt;
  });
}

export async function loadFirstFridaysEvents(
  config: FirstFridaysSourceConfig,
): Promise<NormalizedFirstFridaysEvent[]> {
  return generateFirstFridaysEvents(config);
}
