import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEditorialContainer,
  decomposeEditorialOpportunities,
  hasConcreteChildDate,
  isCalendarEligibleChild,
  isFallbackMidnightDate,
  jsonLdEventsToOpportunities,
  looksLikeEditorialContainerTitle,
  mergeExtractedOpportunities,
  titlesMatch,
} from './editorial-container.js';
import { parseJsonLdPageGraph } from './jsonld-events.js';
import {
  evaluateInventoryCalendarEligibility,
  isCalendarParentContainerItem,
} from '../creator-calendar/population/eligibility.js';
import type { InventoryItem } from '../inventory/normalize.js';

const NOW = new Date('2026-08-19T16:00:00.000Z');

function inventory(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000801',
    title: 'Wine Down Sundays',
    summary: 'Weekly wine event at Juke House in Kansas City.',
    sourceName: 'discoveries@',
    sourceType: 'email',
    category: 'community_event',
    state: 'new',
    eventDate: '2026-08-22T17:00:00.000Z',
    eventEndDate: null,
    discoveredAt: '2026-08-12T12:00:00.000Z',
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
    venue: 'Juke House',
    businessName: null,
    neighborhood: 'Kansas City',
    address: null,
    locationName: 'Kansas City, MO',
    locationStatus: 'resolved',
    formattedAddress: 'Kansas City, MO',
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: 'https://example.com/wine-down',
    ingest: 'ask_benson_link',
    flags: {
      sponsorFriendly: false,
      luxury: false,
      dining: true,
      dateNight: false,
      estateSale: false,
      businessOpening: false,
      freeEvent: false,
      celebrityCharity: false,
      sports: false,
      reddit: false,
      worldCup: false,
      shopping: false,
      retail: false,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 70,
    whyItMatters: 'KC weekend wine event.',
    metadata: {},
    relevanceScore: null,
    urgencyScore: null,
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'upcoming',
    ...overrides,
  };
}

const PARKVILLE_TITLE = 'Spend a Day in Parkville: Where to Eat, Shop, and Explore';
const NEIGHBORHOODS_TITLE = 'Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods';
const FAMILY_SHOWS_TITLE = 'Family Shows in Kansas City | Schedule 2026–2027';
const OVERLAND_TITLE = 'Events in Overland Park — Downtown OP';

const PARKVILLE_GUIDE = `
Parkville is a walkable river town. Start with coffee on Main, browse the boutiques,
then grab tacos before sunset at the riverfront. No tickets, no showtimes — just a day trip.
`;

const OVERLAND_PAGE = `
Events in Overland Park — Downtown OP
Farmers Market Saturday August 22, 2026 at Clock Tower Plaza
Jazz in the Park Friday August 28, 2026 at Downtown Overland Park
Art Walk Saturday September 5, 2026 at 79th and Marty
`;

const FAMILY_SCHEDULE = `
Family Shows in Kansas City | Schedule 2026–2027
The Lion King — October 12, 2026 at Music Hall
Paw Patrol Live — November 8, 2026 at Municipal Auditorium
Disney On Ice — January 15, 2027 at T-Mobile Center
Bluey's Big Play — March 3, 2027 at Music Hall
`;

const FESTIVAL_JSONLD = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Festival',
  name: 'Panda Fest',
  startDate: '2026-10-09T16:00:00-05:00',
  endDate: '2026-10-11T20:00:00-05:00',
  location: {
    '@type': 'Place',
    name: 'Legends Field',
    address: { '@type': 'PostalAddress', addressLocality: 'Kansas City', addressRegion: 'KS' },
  },
  url: 'https://www.examplefests.com/events-1/panda-fest',
})}</script>`;

const EMBEDDED_EVENT_ARTICLE = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'NewsArticle', headline: 'Weekend notes from the food desk', name: 'Weekend notes from the food desk' },
    {
      '@type': 'Event',
      name: 'Wine Down Sundays',
      startDate: '2026-08-23T17:00:00-05:00',
      location: { '@type': 'Place', name: 'Juke House', address: { addressLocality: 'Kansas City' } },
      url: 'https://jukehousekc.com/wine-down',
    },
  ],
})}</script>
An editorial wrapper about dining. The actual happening is Wine Down Sundays.`;

describe('editorial container vs child event decomposition', () => {
  it('1. neighborhood guide with no dated events is not calendar eligible', () => {
    assert.equal(looksLikeEditorialContainerTitle(PARKVILLE_TITLE), true);
    const classified = classifyEditorialContainer({
      url: 'https://visitkc.com/spend-a-day-in-parkville',
      title: PARKVILLE_TITLE,
      pageText: PARKVILLE_GUIDE,
    });
    assert.equal(classified.isContainer, true);
    assert.equal(classified.parentRepresentsSingleEvent, false);
    const rows = decomposeEditorialOpportunities({
      opportunities: [{ title: PARKVILLE_TITLE, eventDate: '2026-01-01T00:00:00.000Z', sourceUrl: 'https://visitkc.com/parkville' }],
      parentTitle: PARKVILLE_TITLE,
      parentUrl: 'https://visitkc.com/parkville',
      container: classified,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.eventDate, null);
    const item = inventory({
      title: PARKVILLE_TITLE,
      eventDate: '2026-08-22T00:00:00.000Z',
      venue: null,
      summary: PARKVILLE_GUIDE,
      sourceUrl: 'https://visitkc.com/parkville',
    });
    assert.equal(isCalendarParentContainerItem(item), true);
    assert.equal(evaluateInventoryCalendarEligibility(item, NOW).ok, false);
  });

  it('2. Events in Overland Park hub is not itself an event; children are extracted', () => {
    const classified = classifyEditorialContainer({
      url: 'https://downtownop.org/events',
      title: OVERLAND_TITLE,
      pageText: OVERLAND_PAGE,
      extractedTitles: ['Farmers Market', 'Jazz in the Park', 'Art Walk', OVERLAND_TITLE],
    });
    assert.equal(classified.isContainer, true);
    assert.equal(classified.parentRepresentsSingleEvent, false);
    const rows = decomposeEditorialOpportunities({
      opportunities: [
        { title: OVERLAND_TITLE, eventDate: '2026-08-22', sourceUrl: 'https://downtownop.org/events' },
        { title: 'Farmers Market', eventDate: '2026-08-22', venue: 'Clock Tower Plaza', sourceUrl: 'https://downtownop.org/farmers' },
        { title: 'Jazz in the Park', eventDate: '2026-08-28', venue: 'Downtown Overland Park', sourceUrl: 'https://downtownop.org/jazz' },
        { title: 'Art Walk', eventDate: '2026-09-05', venue: '79th and Marty', sourceUrl: 'https://downtownop.org/artwalk' },
      ],
      parentTitle: OVERLAND_TITLE,
      parentUrl: 'https://downtownop.org/events',
      publisher: 'downtownop.org',
      container: classified,
    });
    assert.equal(rows.some((row) => titlesMatch(row.title, OVERLAND_TITLE)), false);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => isCalendarEligibleChild(row, OVERLAND_TITLE)));
    assert.ok(rows.every((row) => row.parentArticleUrl === 'https://downtownop.org/events'));
    assert.equal(evaluateInventoryCalendarEligibility(inventory({ title: OVERLAND_TITLE, venue: 'Downtown OP' }), NOW).ok, false);
    const hubChild = inventory({
      title: 'Jazz in the Park',
      eventDate: '2026-08-28T23:00:00.000Z',
      venue: 'Downtown Overland Park',
      locationName: 'Downtown Overland Park',
      sourceUrl: 'https://downtownop.org/events',
      ingest: 'scrape_listing',
      metadata: {
        containerChild: true,
        calendarEligible: true,
        listingSourceUrl: 'https://downtownop.org/events',
      },
    });
    assert.equal(isCalendarParentContainerItem(hubChild), false);
    assert.equal(evaluateInventoryCalendarEligibility(hubChild, NOW).ok, true);
  });

  it('3. family-show schedule produces performances, not the schedule title', () => {
    const classified = classifyEditorialContainer({
      url: 'https://kctheater.org/family-shows-schedule-2026-2027',
      title: FAMILY_SHOWS_TITLE,
      pageText: FAMILY_SCHEDULE,
      extractedTitles: ['The Lion King', 'Paw Patrol Live', 'Disney On Ice', "Bluey's Big Play"],
    });
    assert.equal(classified.kind, 'multi_event_schedule');
    const rows = decomposeEditorialOpportunities({
      opportunities: [
        { title: FAMILY_SHOWS_TITLE, eventDate: '2026-2027', sourceUrl: 'https://kctheater.org/schedule' },
        { title: 'The Lion King', eventDate: '2026-10-12T19:00:00', venue: 'Music Hall', sourceUrl: 'https://kctheater.org/lion-king' },
        { title: 'Paw Patrol Live', eventDate: '2026-11-08T14:00:00', venue: 'Municipal Auditorium' },
        { title: 'Disney On Ice', eventDate: '2027-01-15T19:00:00', venue: 'T-Mobile Center' },
        { title: "Bluey's Big Play", eventDate: '2027-03-03T18:00:00', venue: 'Music Hall' },
      ],
      parentTitle: FAMILY_SHOWS_TITLE,
      parentUrl: 'https://kctheater.org/schedule',
      container: classified,
    });
    assert.equal(rows.length, 4);
    assert.equal(rows.some((row) => titlesMatch(row.title, FAMILY_SHOWS_TITLE)), false);
    assert.equal(hasConcreteChildDate('2026-2027'), false);
  });

  it('4. genuine single festival page remains one event', () => {
    const classified = classifyEditorialContainer({
      url: 'https://www.examplefests.com/events-1/panda-fest',
      title: 'Panda Fest',
      pageText: `Panda Fest at Legends Field. October 9–11, 2026. Get tickets now. ${FESTIVAL_JSONLD}`,
    });
    assert.equal(classified.isContainer, false);
    assert.equal(classified.parentRepresentsSingleEvent, true);
    const item = inventory({
      title: 'Panda Fest',
      venue: 'Legends Field',
      sourceUrl: 'https://www.examplefests.com/events-1/panda-fest',
      eventDate: '2026-10-09T21:00:00.000Z',
    });
    assert.equal(isCalendarParentContainerItem(item), false);
    assert.equal(evaluateInventoryCalendarEligibility(item, NOW).ok, true);
  });

  it('5. one embedded Event JSON-LD in an editorial wrapper survives as the child', () => {
    const graph = parseJsonLdPageGraph(EMBEDDED_EVENT_ARTICLE);
    assert.equal(graph.events.length, 1);
    assert.equal(graph.events[0]?.name, 'Wine Down Sundays');
    const classified = classifyEditorialContainer({
      url: 'https://thepitchkc.com/weekend-notes',
      title: 'Weekend notes from the food desk',
      pageText: EMBEDDED_EVENT_ARTICLE,
      jsonLdEvents: graph.events,
      hasArticleSchema: graph.hasArticleSchema,
    });
    assert.equal(classified.isContainer, true);
    const rows = decomposeEditorialOpportunities({
      opportunities: [
        { title: 'Weekend notes from the food desk', eventDate: '2026-08-23T00:00:00.000Z' },
        ...jsonLdEventsToOpportunities(graph.events, 'https://thepitchkc.com/weekend-notes', 'thepitchkc.com'),
      ],
      parentTitle: 'Weekend notes from the food desk',
      parentUrl: 'https://thepitchkc.com/weekend-notes',
      container: classified,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.title, 'Wine Down Sundays');
    assert.match(rows[0]?.eventDate ?? '', /2026-08-23/);
    assert.equal(rows[0]?.parentArticleUrl, 'https://thepitchkc.com/weekend-notes');
    assert.equal(rows[0]?.sourceUrl, 'https://jukehousekc.com/wine-down');
  });

  it('6. parser fallback midnight does not turn an article into an event', () => {
    assert.equal(isFallbackMidnightDate('2026-01-01T00:00:00.000Z'), true);
    assert.equal(isFallbackMidnightDate('2026'), true);
    assert.equal(isFallbackMidnightDate('2026-2027'), true);
    assert.equal(isFallbackMidnightDate('2026-08-22T17:00:00.000Z'), false);
    const item = inventory({
      title: NEIGHBORHOODS_TITLE,
      eventDate: '2026-09-01T00:00:00.000Z',
      venue: 'Kansas City',
      summary: 'Twenty neighborhoods to wander. No showtimes.',
    });
    assert.equal(evaluateInventoryCalendarEligibility(item, NOW).ok, false);
  });

  it('7. roundup + official page duplicates reconcile to one child', () => {
    const merged = mergeExtractedOpportunities(
      jsonLdEventsToOpportunities(
        [
          {
            name: 'Jazz in the Park',
            startDate: '2026-08-28',
            endDate: null,
            startTime: '18:00:00',
            venue: 'Downtown Overland Park',
            city: 'Overland Park',
            address: null,
            url: 'https://downtownop.org/jazz',
            description: 'Official listing',
            publisher: 'downtownop.org',
          },
        ],
        'https://visitkc.com/events-roundup',
      ),
      [
        {
          title: 'Jazz in the Park',
          eventDate: '2026-08-28',
          venue: 'Downtown Overland Park',
          sourceUrl: 'https://visitkc.com/events-roundup#jazz',
        },
      ],
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.sourceUrl, 'https://downtownop.org/jazz');
  });
});
