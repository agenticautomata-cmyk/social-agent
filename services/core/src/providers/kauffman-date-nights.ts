import { loadKauffmanEvents, parseKauffmanSourceConfig, type KauffmanSourceConfig } from './kauffman.js';
import {
  buildRevenueOpportunity,
  dedupeRevenueOpportunities,
  type NormalizedRevenueOpportunity,
} from './revenue-alignment-shared.js';

export type KauffmanDateNightsSourceConfig = KauffmanSourceConfig & {
  minHour?: number;
};

const FAMILY_EXCLUDE_RE =
  /\b(family|children|kids|youth|school|matinee|disney|sesame|puppet|storytime|young audience)\b/i;

const DATE_NIGHT_INCLUDE_RE =
  /\b(jazz|blues|classical|symphony|opera|ballet|dance|romantic|intimate|evening|date night|harriman|helzberg|muriel kauffman)\b/i;

export function parseKauffmanDateNightsSourceConfig(raw: unknown): KauffmanDateNightsSourceConfig {
  const base = parseKauffmanSourceConfig(raw);
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    ...base,
    minHour: typeof c.minHour === 'number' ? c.minHour : 17,
  };
}

function isEveningPerformance(body: string, minHour: number): boolean {
  const timeMatch = body.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]!, 10);
    const ampm = timeMatch[3]!.toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return hour >= minHour;
  }
  if (/\b(evening|night|pm|8:\d{2}|7:\d{2}|9:\d{2})\b/i.test(body)) return true;
  return false;
}

function isDateNightSuitable(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  if (FAMILY_EXCLUDE_RE.test(text)) return false;
  if (DATE_NIGHT_INCLUDE_RE.test(text)) return true;
  return isEveningPerformance(body, 17);
}

export async function loadKauffmanDateNights(
  config: KauffmanDateNightsSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseKauffmanDateNightsSourceConfig(config);
  const minHour = parsed.minHour ?? 17;
  const events = await loadKauffmanEvents(parsed);
  const results: NormalizedRevenueOpportunity[] = [];

  for (const event of events) {
    if (!isDateNightSuitable(event.title, event.body)) continue;
    if (!isEveningPerformance(event.body, minHour) && !DATE_NIGHT_INCLUDE_RE.test(`${event.title} ${event.body}`)) {
      continue;
    }

    results.push(
      buildRevenueOpportunity({
        externalId: `kauffman-date-${event.externalId}`,
        title: event.title,
        body: event.body,
        businessName: 'Kauffman Center for the Performing Arts',
        venue: event.venue ?? 'Kauffman Center',
        category: 'date_night',
        sourceUrl: `${event.url}#date-night`,
        website: 'https://www.kauffmancenter.org/',
        publishedAt: event.publishedAt,
        eventDate: event.eventStartsAt,
        startDate: event.eventStartsAt,
        endDate: event.eventEndsAt,
        address: '1601 Broadway Boulevard, Kansas City, MO 64108',
        neighborhood: 'downtown',
      }),
    );
  }

  return dedupeRevenueOpportunities(results);
}
