import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackEventOpportunity,
  isEventItemPath,
  isEventIndexPath,
  isOfficialEventOccurrencePage,
  isTicketVendorUrl,
  officialOccurrenceTitle,
  parseOfficialEventDates,
  scoreEventOccurrenceSignals,
} from './event-occurrence.js';
import { inferOpportunityType } from './url-entity-opportunity.js';

const FESTIVAL_PAGE = `
KANSAS CITY — Outdoor Asian food festival
GET TICKETS NOW
2026 TIME
October 9–11, 2026
LOCATION Legends Field
1800 Village West Pkwy, Kansas City, KS 66111
Friday 4pm–10pm
Saturday 10am–10pm
Sunday 10am–8pm
`;

const RESTAURANT_PAGE = `
Welcome to our restaurant. View menu, dinner reservations, and order online.
Lunch menu and dining room hours. Coffee and bakery case daily.
`;

describe('official event occurrence authority', () => {
  it('treats an events-collection item path as an event page, not a restaurant', () => {
    const url = 'https://www.examplefests.com/events-1/project-one-abcd';
    assert.equal(isEventItemPath(url), true);
    assert.equal(isEventIndexPath(url), false);
    assert.equal(
      isOfficialEventOccurrencePage({
        pageUrl: url,
        pageTitle: 'KANSAS CITY — City Fest',
        pageText: FESTIVAL_PAGE,
        businessName: 'City Fest',
      }),
      true,
    );
    assert.equal(
      inferOpportunityType(FESTIVAL_PAGE, 'City Fest'),
      'festival_event',
    );
  });

  it('parses an official date range without inventing a year', () => {
    const dates = parseOfficialEventDates('October 9–11, 2026 at the venue');
    assert.equal(dates.start?.toISOString().slice(0, 10), '2026-10-09');
    assert.equal(dates.end?.toISOString().slice(0, 10), '2026-10-11');
  });

  it('keeps a genuine restaurant page as restaurant / food discovery', () => {
    assert.equal(
      isOfficialEventOccurrencePage({
        pageUrl: 'https://www.joesbbq.com/',
        pageTitle: "Joe's BBQ",
        pageText: RESTAURANT_PAGE,
        businessName: "Joe's BBQ",
      }),
      false,
    );
    assert.equal(inferOpportunityType(RESTAURANT_PAGE, "Joe's BBQ"), 'restaurant_food_discovery');
  });

  it('does not convert a restaurant homepage that mentions one dinner into an event entity', () => {
    const text = `${RESTAURANT_PAGE} Join us for Taco Night May 12, 2026.`;
    assert.equal(
      isOfficialEventOccurrencePage({
        pageUrl: 'https://www.joesbbq.com/',
        pageTitle: "Joe's BBQ",
        pageText: text,
        businessName: "Joe's BBQ",
      }),
      false,
    );
    assert.equal(inferOpportunityType(text, "Joe's BBQ"), 'restaurant_food_discovery');
  });

  it('does not invent a current occurrence when the official page has no date', () => {
    const fallback = buildFallbackEventOpportunity({
      pageUrl: 'https://www.examplefests.com/events-1/undated-fest',
      pageTitle: 'City Fest',
      pageText: 'Outdoor festival. Get tickets now. Main Field.',
      businessName: 'City Fest',
    });
    assert.equal(fallback, null);
  });

  it('builds a fallback dated event from official page signals', () => {
    const fallback = buildFallbackEventOpportunity({
      pageUrl: 'https://www.examplefests.com/events-1/project-one-abcd',
      pageTitle: 'KANSAS CITY — City Fest',
      pageText: FESTIVAL_PAGE,
      businessName: 'City Fest',
    });
    assert.ok(fallback);
    assert.equal(fallback!.eventDate, '2026-10-09');
    assert.equal(fallback!.eventEndDate, '2026-10-11');
    assert.equal(fallback!.venue, 'Legends Field');
    assert.match(fallback!.location ?? '', /Kansas City,\s*KS/i);
    assert.equal(fallback!.category, 'festival');
    assert.equal(fallback!.sourceUrl, 'https://www.examplefests.com/events-1/project-one-abcd');
  });

  it('keeps official page title and URL over ticket-vendor noise', () => {
    assert.equal(
      officialOccurrenceTitle({
        pageTitle: 'KANSAS CITY — City Fest',
        fallbackTitle: 'City Fest Tickets, Multiple dates | Eventbrite',
      }),
      'KANSAS CITY — City Fest',
    );
    assert.equal(isTicketVendorUrl('https://www.eventbrite.com/e/city-fest-tickets-1'), true);
    assert.equal(isTicketVendorUrl('https://www.examplefests.com/events-1/slug'), false);
  });

  it('scores topical food as weaker than combined event signals', () => {
    const signals = scoreEventOccurrenceSignals({
      pageUrl: 'https://www.examplefests.com/events-1/project-one-abcd',
      pageTitle: 'KANSAS CITY — City Fest',
      pageText: FESTIVAL_PAGE,
    });
    assert.ok(signals.families.includes('dated'));
    assert.ok(signals.families.includes('tickets'));
    assert.ok(signals.families.includes('lexicon'));
    assert.equal(signals.isPrimarilyRestaurantPage, false);
    assert.equal(signals.isEventOccurrence, true);
  });

  it('does not treat a multi-event schedule page as a single official occurrence', () => {
    const signals = scoreEventOccurrenceSignals({
      pageUrl: 'https://kctheater.org/family-shows-schedule-2026-2027',
      pageTitle: 'Family Shows in Kansas City | Schedule 2026–2027',
      pageText: `
Family Shows in Kansas City | Schedule 2026–2027
The Lion King — October 12, 2026 at Music Hall. Get tickets now.
Paw Patrol Live — November 8, 2026 at Municipal Auditorium.
Disney On Ice — January 15, 2027 at T-Mobile Center.
`,
    });
    assert.equal(signals.isEventOccurrence, false);
  });
});
