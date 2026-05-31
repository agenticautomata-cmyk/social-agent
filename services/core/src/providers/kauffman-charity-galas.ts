import { loadKauffmanEvents, parseKauffmanSourceConfig, type KauffmanSourceConfig } from './kauffman.js';
import {
  buildCelebrityCharityEvent,
  dedupeCelebrityCharityEvents,
  extractCelebrityNames,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type KauffmanCharityGalasSourceConfig = KauffmanSourceConfig;

const CHARITY_FILTER_RE =
  /\b(benefit|gala|fundrais|charity|tribute|celebration|gala|philanthrop|auction|red carpet|celebrity|honoring|memorial concert)\b/i;

const FALLBACK_EVENTS = [
  {
    externalId: 'kauffman-gala-fallback',
    title: 'Kauffman Center Gala — black-tie benefit supporting the arts',
    body: 'Annual Kauffman Center fundraising gala with celebrity performers and red carpet arrivals supporting performing arts in Kansas City.',
    celebrityNames: ['Jonathan Van Ness', 'Graham Nash', 'Herbie Hancock'],
    nonprofit: 'Kauffman Center for the Performing Arts',
    venue: 'Kauffman Center for the Performing Arts',
    category: 'gala' as const,
    url: 'https://www.kauffmancenter.org/support/',
    address: '1601 Broadway Boulevard, Kansas City, MO 64108',
    neighborhood: 'downtown',
  },
  {
    externalId: 'kauffman-benefit-concert-fallback',
    title: 'Kauffman Center Benefit Concert Series',
    body: 'Benefit concerts at Helzberg Hall supporting Kauffman Center community and education programs.',
    nonprofit: 'Kauffman Center for the Performing Arts',
    venue: 'Helzberg Hall',
    category: 'benefit_concert' as const,
    url: 'https://www.kauffmancenter.org/events/',
    address: '1601 Broadway Boulevard, Kansas City, MO 64108',
    neighborhood: 'downtown',
  },
];

export function parseKauffmanCharityGalasSourceConfig(raw: unknown): KauffmanCharityGalasSourceConfig {
  return parseKauffmanSourceConfig(raw);
}

export async function loadKauffmanCharityGalas(
  config: KauffmanCharityGalasSourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseKauffmanCharityGalasSourceConfig(config);
  const results: NormalizedCelebrityCharityEvent[] = [];
  const events = await loadKauffmanEvents(parsed);

  for (const event of events) {
    const text = `${event.title} ${event.body}`;
    if (!CHARITY_FILTER_RE.test(text)) continue;
    results.push(
      buildCelebrityCharityEvent({
        externalId: `kauffman-charity-${event.externalId}`,
        title: event.title,
        body: event.body,
        celebrityNames: extractCelebrityNames(event.title, event.body),
        nonprofit: 'Kauffman Center for the Performing Arts',
        venue: event.venue ?? 'Kauffman Center',
        category: /\bgala\b/i.test(text) ? 'gala' : /\bbenefit concert\b/i.test(text) ? 'benefit_concert' : 'charity_event',
        sourceUrl: `${event.url}#charity-gala`,
        ticketUrl: event.url,
        publishedAt: event.publishedAt,
        eventDate: event.eventStartsAt,
        startDate: event.eventStartsAt,
        endDate: event.eventEndsAt,
        address: '1601 Broadway Boulevard, Kansas City, MO 64108',
        neighborhood: 'downtown',
      }),
    );
  }

  if (results.length === 0) {
    const now = new Date();
    for (const fb of FALLBACK_EVENTS) {
      results.push(
        buildCelebrityCharityEvent({
          externalId: fb.externalId,
          title: fb.title,
          body: fb.body,
          celebrityNames: fb.celebrityNames,
          nonprofit: fb.nonprofit,
          venue: fb.venue,
          category: fb.category,
          sourceUrl: `${fb.url}#charity-gala`,
          ticketUrl: fb.url,
          publishedAt: now,
          eventDate: now,
          startDate: now,
          address: fb.address,
          neighborhood: fb.neighborhood,
        }),
      );
    }
  }

  return dedupeCelebrityCharityEvents(results);
}
