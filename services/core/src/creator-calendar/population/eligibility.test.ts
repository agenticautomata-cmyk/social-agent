import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InventoryItem } from '../../inventory/normalize.js';
import {
  calendarStartAtFromDateTime,
  calendarSuggestionIsDisplayable,
  calendarVerificationDisplay,
  candidateFromCuratorLead,
  candidateFromInventory,
  evaluateCuratorLeadCalendarEligibility,
  evaluateInventoryCalendarEligibility,
  inventoryCalendarAllDay,
  inventoryTemporalDayKey,
  isCalendarParentContainerItem,
  strongerVerification,
  verificationRank,
} from './eligibility.js';

const NOW = new Date('2026-08-19T16:00:00.000Z');

function inventory(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000401',
    title: 'Wine Down Sundays',
    summary: 'Weekly wine event at Juke House in Kansas City.',
    sourceName: 'discoveries@',
    sourceType: 'email',
    category: 'community_event',
    state: 'new',
    eventDate: '2026-09-16T17:00:00.000Z',
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
    ingest: 'gmail_discoveries',
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

describe('calendar inventory eligibility', () => {
  it('accepts a dated KC event from discoveries@', () => {
    assert.equal(evaluateInventoryCalendarEligibility(inventory(), NOW).ok, true);
  });

  it('accepts an Ask Benson listing event', () => {
    const item = inventory({
      title: 'Art in the Loop: Celebrates 816 Day',
      ingest: 'ask_benson_listing',
      venue: 'City Market',
      sourceUrl: 'https://citymarket.org/816',
    });
    assert.equal(evaluateInventoryCalendarEligibility(item, NOW).ok, true);
  });

  it('rejects an expired event', () => {
    const item = inventory({
      eventDate: '2026-08-01T17:00:00.000Z',
      lifecycleStatus: 'expired',
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'expired');
  });

  it('rejects a past-dated event', () => {
    const item = inventory({ eventDate: '2026-08-10T17:00:00.000Z' });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'expired');
  });

  it('Woman of Influence style date-only: not past_event on intended Aug 28 Chicago day', () => {
    const item = inventory({
      title: 'Woman of Influence',
      eventDate: '2026-08-28T00:00:00.000Z',
      eventEndDate: null,
      metadata: {
        extracted: {
          eventDate: '2026-08-28',
          startTime: null,
        },
      },
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-08-28');
    assert.equal(evaluateInventoryCalendarEligibility(item, new Date('2026-08-27T17:00:00.000Z')).ok, true);
    const onDay = evaluateInventoryCalendarEligibility(item, new Date('2026-08-28T17:00:00.000Z'));
    assert.equal(onDay.ok, true);
    if (!onDay.ok) assert.notEqual(onDay.detail, 'past_event');
    // After the intended day: temporal authority / past_event reject (not audience freshness).
    const afterTodayKey = '2026-08-29';
    const eventKey = inventoryTemporalDayKey(item.eventDate, item, 'start');
    assert.ok(eventKey && eventKey < afterTodayKey);
    const after = evaluateInventoryCalendarEligibility(item, new Date('2026-08-29T17:00:00.000Z'));
    assert.equal(after.ok, false);
    if (!after.ok) {
      assert.ok(
        after.detail === 'not_temporally_current' || after.detail === 'past_event',
        after.detail,
      );
      assert.notEqual(after.detail, 'stale_freshness');
    }
  });

  it('The Calling equivalent date-only: not past_event on intended Aug 28', () => {
    const item = inventory({
      title: 'The Calling',
      eventDate: '2026-08-28T00:00:00.000Z',
      eventEndDate: null,
      metadata: {
        extracted: {
          eventDate: '2026-08-28',
          startTime: null,
        },
      },
    });
    const onDay = evaluateInventoryCalendarEligibility(item, new Date('2026-08-28T17:00:00.000Z'));
    assert.equal(onDay.ok, true);
    if (!onDay.ok) assert.notEqual(onDay.detail, 'past_event');
  });

  it('multi-day date-only start/end use intended encoded UTC dates for past_event', () => {
    const item = inventory({
      eventDate: '2026-08-28T00:00:00.000Z',
      eventEndDate: '2026-08-30T00:00:00.000Z',
      metadata: {
        extracted: {
          eventDate: '2026-08-28',
          eventEndDate: '2026-08-30',
          startTime: null,
        },
      },
    });
    const startKey = inventoryTemporalDayKey(item.eventDate, item, 'start');
    const endKey = inventoryTemporalDayKey(item.eventEndDate, item, 'end');
    assert.equal(startKey, '2026-08-28');
    assert.equal(endKey, '2026-08-30');
    // Mid-range / last day: past_event branch must not treat these as past via day keys.
    for (const todayKey of ['2026-08-28', '2026-08-29', '2026-08-30']) {
      assert.equal(Boolean(startKey && startKey < todayKey && (!endKey || endKey < todayKey)), false);
    }
    // After end day: same comparison the past_event branch uses.
    assert.equal(Boolean(startKey && startKey < '2026-08-31' && endKey && endKey < '2026-08-31'), true);
    // Full evaluate on the start day remains eligible (freshness still passes).
    assert.equal(evaluateInventoryCalendarEligibility(item, new Date('2026-08-28T17:00:00.000Z')).ok, true);
  });

  it('timed OPCC-style event keeps Chicago local-day past_event behavior', () => {
    // 2026-09-16 18:00 America/Chicago = 2026-09-16T23:00:00.000Z
    const item = inventory({
      eventDate: '2026-09-16T23:00:00.000Z',
      eventEndDate: null,
      metadata: {
        extracted: {
          eventDate: '2026-09-16',
          startTime: '6:00 PM',
        },
      },
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-09-16');
    assert.equal(evaluateInventoryCalendarEligibility(item, new Date('2026-09-16T17:00:00.000Z')).ok, true);
    const past = evaluateInventoryCalendarEligibility(item, new Date('2026-09-17T17:00:00.000Z'));
    assert.equal(past.ok, false);
    if (!past.ok) {
      // Controlled now is wired into temporal authority, which rejects before past_event.
      assert.ok(
        past.detail === 'not_temporally_current' || past.detail === 'past_event',
        past.detail,
      );
    }
  });

  it('real timed event at UTC midnight uses Chicago local day, not date-only UTC YMD', () => {
    // Instant is exactly T00:00:00Z but extracted startTime proves a real clock.
    // Chicago local day for 2026-09-16T00:00:00Z is 2026-09-15.
    const item = inventory({
      eventDate: '2026-09-16T00:00:00.000Z',
      eventEndDate: null,
      metadata: {
        extracted: {
          eventDate: '2026-09-16',
          startTime: '7:00 PM',
        },
      },
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-09-15');
    const onUtcYmd = evaluateInventoryCalendarEligibility(item, new Date('2026-09-16T17:00:00.000Z'));
    assert.equal(onUtcYmd.ok, false);
    if (!onUtcYmd.ok) assert.equal(onUtcYmd.detail, 'past_event');
    const onChicagoDay = evaluateInventoryCalendarEligibility(item, new Date('2026-09-15T17:00:00.000Z'));
    assert.equal(onChicagoDay.ok, true);
    if (!onChicagoDay.ok) assert.notEqual(onChicagoDay.detail, 'past_event');
  });

  it('date-only UTC-midnight fallback when extracted evidence absent', () => {
    const item = inventory({
      eventDate: '2026-08-28T00:00:00.000Z',
      eventEndDate: null,
      metadata: {},
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-08-28');
    const onDay = evaluateInventoryCalendarEligibility(item, new Date('2026-08-28T17:00:00.000Z'));
    assert.equal(onDay.ok, true);
    if (!onDay.ok) assert.notEqual(onDay.detail, 'past_event');
  });

  it('Just Between Friends multi-day: survives middle/final day; expires after end (not stale_freshness)', () => {
    const item = inventory({
      title: 'Just Between Friends Consignment Sale',
      eventDate: '2026-09-02T00:00:00.000Z',
      eventEndDate: '2026-09-06T00:00:00.000Z',
      discoveredAt: '2026-08-19T15:33:17.077Z',
      createdAt: '2026-08-19T15:33:17.091Z',
      metadata: {
        extracted: {
          eventDate: '2026-09-02',
          eventEndDate: '2026-09-06',
          startTime: null,
        },
      },
    });
    assert.equal(evaluateInventoryCalendarEligibility(item, new Date('2026-09-01T17:00:00.000Z')).ok, true);
    assert.equal(evaluateInventoryCalendarEligibility(item, new Date('2026-09-02T17:00:00.000Z')).ok, true);
    const mid = evaluateInventoryCalendarEligibility(item, new Date('2026-09-03T17:00:00.000Z'));
    assert.equal(mid.ok, true);
    if (!mid.ok) assert.notEqual(mid.detail, 'stale_freshness');
    const finalDay = evaluateInventoryCalendarEligibility(item, new Date('2026-09-06T17:00:00.000Z'));
    assert.equal(finalDay.ok, true);
    if (!finalDay.ok) assert.notEqual(finalDay.detail, 'stale_freshness');
    const after = evaluateInventoryCalendarEligibility(item, new Date('2026-09-07T17:00:00.000Z'));
    assert.equal(after.ok, false);
    if (!after.ok) {
      assert.equal(after.detail, 'not_temporally_current');
      assert.notEqual(after.detail, 'stale_freshness');
    }
  });

  it('KHA Convention: eligible on final day; expired the day after', () => {
    const item = inventory({
      title: 'Kansas Hospital Association Convention & Trade Show',
      eventDate: '2026-09-10T00:00:00.000Z',
      eventEndDate: '2026-09-11T00:00:00.000Z',
      discoveredAt: '2026-08-19T15:33:18.475Z',
      metadata: {
        extracted: {
          eventDate: '2026-09-10',
          eventEndDate: '2026-09-11',
          startTime: null,
        },
      },
    });
    const finalDay = evaluateInventoryCalendarEligibility(item, new Date('2026-09-11T17:00:00.000Z'));
    assert.equal(finalDay.ok, true);
    if (!finalDay.ok) assert.notEqual(finalDay.detail, 'stale_freshness');
    const after = evaluateInventoryCalendarEligibility(item, new Date('2026-09-12T17:00:00.000Z'));
    assert.equal(after.ok, false);
    if (!after.ok) {
      assert.equal(after.detail, 'not_temporally_current');
      assert.notEqual(after.detail, 'stale_freshness');
    }
  });

  it('early-discovered future timed event is not rejected for discovery age', () => {
    const item = inventory({
      title: 'Kurt Vile & the Violators',
      eventDate: '2026-10-16T01:00:00.000Z',
      eventEndDate: null,
      discoveredAt: '2026-07-28T22:31:59.823Z',
      createdAt: '2026-07-28T22:31:59.829Z',
      venue: 'The Truman',
      locationName: 'Kansas City, MO',
    });
    const nearShow = evaluateInventoryCalendarEligibility(item, new Date('2026-10-10T17:00:00.000Z'));
    assert.equal(nearShow.ok, true);
    if (!nearShow.ok) assert.notEqual(nearShow.detail, 'stale_freshness');
  });

  it('historical expired event is rejected by temporal authority with controlled now', () => {
    const item = inventory({
      title: 'Va Bene Italian Eatery closing',
      eventDate: '2026-07-16T19:00:24.000Z',
      eventEndDate: '2026-07-16T19:00:24.000Z',
      discoveredAt: '2026-08-19T20:21:31.486Z',
    });
    const result = evaluateInventoryCalendarEligibility(item, new Date('2026-08-20T17:00:00.000Z'));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.detail, 'not_temporally_current');
      assert.notEqual(result.detail, 'stale_freshness');
    }
  });

  it('ordinary fresh future event remains eligible', () => {
    const item = inventory({
      title: 'Hillcrest Transitional Housing 2026',
      eventDate: '2026-08-29T17:30:00.000Z',
      discoveredAt: '2026-08-19T15:33:16.694Z',
      venue: 'Overland Park Convention Center',
      locationName: 'Overland Park, KS',
    });
    assert.equal(evaluateInventoryCalendarEligibility(item, new Date('2026-08-20T17:00:00.000Z')).ok, true);
  });

  it('passes supplied now into temporal currentness (not wall clock)', () => {
    const item = inventory({
      title: 'Future concert',
      eventDate: '2026-11-01T01:00:00.000Z',
      venue: 'T-Mobile Center',
      locationName: 'Kansas City, MO',
    });
    // Before the show: eligible under controlled now deep in the future window.
    assert.equal(evaluateInventoryCalendarEligibility(item, new Date('2026-10-20T17:00:00.000Z')).ok, true);
    // After the show under controlled now: temporally expired even if wall clock is earlier.
    const afterShow = evaluateInventoryCalendarEligibility(item, new Date('2026-11-02T17:00:00.000Z'));
    assert.equal(afterShow.ok, false);
    if (!afterShow.ok) assert.equal(afterShow.detail, 'not_temporally_current');
  });

  it('rejects a wrong-city event', () => {
    const item = inventory({
      title: 'Reading Rhythms Bronx',
      summary: 'Book events in the Bronx',
      venue: 'The Bronx',
      locationName: 'The Bronx, New York',
      formattedAddress: 'The Bronx, New York',
      neighborhood: 'Bronx',
      ingest: 'ask_benson_link',
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
  });

  it('rejects an Orlando headline even when inventory is dated', () => {
    const item = inventory({
      title: 'Rising country star Megan Moroney rolls into Orlando',
      summary: 'Orlando concert preview',
      venue: null,
      locationName: 'Orlando, FL',
      formattedAddress: 'Orlando, FL',
      neighborhood: null,
      ingest: 'scrape_listing',
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
  });

  it('rejects an Orlando headline even when location fields say Kansas City', () => {
    const item = inventory({
      title: 'Rising country star Megan Moroney rolls into Orlando',
      summary: 'Orlando concert preview',
      venue: null,
      locationName: 'Kansas City, MO',
      formattedAddress: 'Kansas City, MO',
      neighborhood: 'Kansas City',
      ingest: 'scrape_listing',
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
  });

  it('rejects a past-year concert headline', () => {
    const item = inventory({
      title: 'Courtney Barnett performs at Rock the Garden 2015',
      venue: 'Walker Art Center',
      locationName: 'Kansas City, MO',
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'expired');
  });

  it('rejects a partnership card with no event identity', () => {
    const item = inventory({
      title: 'Brand ambassador program',
      eventDate: '2026-08-20T17:00:00.000Z',
      category: 'creator_partnership',
      venue: null,
      locationName: 'Kansas City, MO',
      summary: 'Apply to the national creator program.',
      ingest: 'ask_benson_link',
      metadata: { opportunityCategory: 'creator_partnership' },
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
  });

  it('maps VERIFIED vs PARTIALLY_VERIFIED display truthfully', () => {
    assert.equal(calendarVerificationDisplay('VERIFIED'), 'verified');
    assert.equal(calendarVerificationDisplay('PARTIALLY_VERIFIED'), 'needs_verification');
    assert.equal(calendarVerificationDisplay('SOCIAL_LEAD'), 'needs_verification');
    assert.equal(calendarVerificationDisplay('trusted_secondary_source'), 'needs_verification');
    assert.ok(verificationRank('VERIFIED') > verificationRank('PARTIALLY_VERIFIED'));
    assert.equal(strongerVerification('SOCIAL_LEAD', 'VERIFIED'), 'VERIFIED');
  });

  it('hides already-projected Orlando and national SEO suggestions at display time', () => {
    assert.equal(
      calendarSuggestionIsDisplayable({
        title: 'Rising country star Megan Moroney rolls into Orlando',
        location: 'Kansas City, MO',
      }),
      false,
    );
    assert.equal(
      calendarSuggestionIsDisplayable({
        title: 'Tax free weekends 2026: Sales tax holidays in every state | Fidelity',
        location: null,
      }),
      false,
    );
    assert.equal(
      calendarSuggestionIsDisplayable({ title: 'Wine Down Sundays', location: 'Juke House' }),
      true,
    );
    assert.equal(
      calendarSuggestionIsDisplayable({
        title: 'Courtney Barnett performs at Rock the Garden 2015',
        location: 'Kansas City',
      }),
      false,
    );
    assert.equal(
      calendarSuggestionIsDisplayable({
        title: 'Events in Overland Park — Downtown OP',
        location: 'Overland Park',
      }),
      false,
    );
    assert.equal(
      calendarSuggestionIsDisplayable({
        title: 'Courtney Barnett performs at Rock the Garden 2015',
        location: 'Kansas City',
      }),
      false,
    );
  });

  it('accepts a dated hub-listing child that shares the parent /events URL', () => {
    const item = inventory({
      title: 'Harvesting Hope',
      summary: 'Oct 1 Harvesting Hope Thursday, October 1, 2026 5:30 PM 8:00 PM Google Calendar ICS',
      ingest: 'scrape_listing',
      sourceName: 'Events in Overland Park — Downtown OP',
      sourceUrl: 'https://www.downtownop.org/events?utm_source=openai',
      venue: null,
      locationName: null,
      formattedAddress: null,
      neighborhood: 'Overland Park',
      eventDate: '2026-10-01T22:30:00.000Z',
      eventEndDate: '2026-10-02T01:00:00.000Z',
      category: 'Event',
      metadata: {
        calendarEligible: true,
        containerChild: true,
        listingSourceUrl: 'https://www.downtownop.org/events?utm_source=openai',
        parentArticleUrl: 'https://www.downtownop.org/events?utm_source=openai',
        opportunityCategory: 'Event',
        tags: ['container_card'],
      },
    });
    assert.equal(isCalendarParentContainerItem(item), false);
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, true);
  });

  it('accepts a dated hub-listing child with no venue when the source name carries the metro', () => {
    const item = inventory({
      title: 'Trick-or-Treat Event',
      summary:
        'Oct 24 Trick-or-Treat Event Saturday, October 24, 2026 2:00 PM 4:00 PM Google Calendar ICS Free community event!',
      ingest: 'scrape_listing',
      sourceName: 'Events in Overland Park — Downtown OP',
      sourceUrl: 'https://www.downtownop.org/events?utm_source=openai',
      venue: null,
      locationName: null,
      formattedAddress: null,
      neighborhood: null,
      eventDate: '2026-10-24T19:00:00.000Z',
      eventEndDate: '2026-10-24T21:00:00.000Z',
      category: 'Event',
      metadata: {
        calendarEligible: true,
        containerChild: true,
        listingSourceUrl: 'https://www.downtownop.org/events?utm_source=openai',
        parentArticleUrl: 'https://www.downtownop.org/events?utm_source=openai',
        opportunityCategory: 'Event',
        tags: ['container_card'],
      },
    });
    assert.equal(isCalendarParentContainerItem(item), false);
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, true);
  });

  it('still rejects the parent hub row and a suppressed container child', () => {
    const parent = inventory({
      title: 'Events in Overland Park — Downtown OP',
      summary: 'All events in Overland Park',
      ingest: 'scrape_listing',
      sourceUrl: 'https://www.downtownop.org/events?utm_source=openai',
      eventDate: null,
      metadata: { editorialContainer: true, calendarEligible: false },
    });
    assert.equal(isCalendarParentContainerItem(parent), true);

    const suppressedChild = inventory({
      title: 'Harvesting Hope',
      summary: 'Oct 1 Harvesting Hope Thursday, October 1, 2026 5:30 PM',
      ingest: 'scrape_listing',
      sourceUrl: 'https://www.downtownop.org/events?utm_source=openai',
      neighborhood: 'Overland Park',
      eventDate: '2026-10-01T22:30:00.000Z',
      metadata: { containerChild: true, calendarEligible: false },
    });
    const result = evaluateInventoryCalendarEligibility(suppressedChild, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'editorial_container');
  });
});

describe('container-child calendar quality guards', () => {
  const childMeta = {
    calendarEligible: true,
    containerChild: true,
    opportunityCategory: 'Event',
    tags: ['container_card'],
  };

  it('rejects listing chrome titles on container children', () => {
    const item = inventory({
      title: 'in calendar view Concerts Happening This Week Today',
      summary: 'Ticketmaster listing navigation chrome.',
      ingest: 'scrape_listing',
      sourceName: '[Benson] T-Mobile Center Concerts',
      sourceUrl: 'https://www.ticketmaster.com/tmobile-center-tickets-kansas-city/venue/250001',
      venue: 'T-Mobile Center',
      locationName: 'Kansas City, MO',
      neighborhood: 'Kansas City',
      eventDate: '2026-09-20T00:00:00.000Z',
      category: 'Event',
      metadata: childMeta,
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'listing_chrome');
  });

  it('keeps a real event title that merely contains Today', () => {
    const item = inventory({
      title: 'Today Show Live at Crown Center',
      summary: 'A ticketed appearance at Crown Center.',
      ingest: 'scrape_listing',
      sourceName: 'Crown Center Events',
      sourceUrl: 'https://www.crowncenter.com/events',
      venue: 'Crown Center',
      locationName: 'Kansas City, MO',
      neighborhood: 'Kansas City',
      eventDate: '2026-09-20T18:00:00.000Z',
      category: 'Event',
      metadata: childMeta,
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, true);
  });

  it('rejects a container child whose title is only the venue name', () => {
    const item = inventory({
      title: 'The Truman',
      summary: 'Tour stop with no recovered show title.',
      ingest: 'scrape_listing',
      sourceName: '[Benson] Shows — The Bowline Brothers',
      sourceUrl: 'https://thebowlinebrothers.com/shows',
      venue: 'The Truman',
      locationName: 'The Truman',
      neighborhood: 'Kansas City',
      formattedAddress: 'Kansas City, MO',
      eventDate: '2026-09-20T23:00:00.000Z',
      category: 'Event',
      metadata: childMeta,
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'venue_as_title');
  });

  it('keeps a container child whose event title differs from the venue', () => {
    const item = inventory({
      title: 'Bowline Brothers Live',
      summary: 'The Bowline Brothers at The Truman.',
      ingest: 'scrape_listing',
      sourceName: '[Benson] Shows — The Bowline Brothers',
      sourceUrl: 'https://thebowlinebrothers.com/shows',
      venue: 'The Truman',
      locationName: 'The Truman',
      neighborhood: 'Kansas City',
      formattedAddress: 'Kansas City, MO',
      eventDate: '2026-09-20T23:00:00.000Z',
      category: 'Event',
      metadata: childMeta,
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, true);
  });

  it('keeps Downtown OP dated children eligible', () => {
    const item = inventory({
      title: 'Harvesting Hope',
      summary: 'Oct 1 Harvesting Hope Thursday, October 1, 2026 5:30 PM 8:00 PM',
      ingest: 'scrape_listing',
      sourceName: 'Events in Overland Park — Downtown OP',
      sourceUrl: 'https://www.downtownop.org/events?utm_source=openai',
      venue: null,
      locationName: null,
      formattedAddress: null,
      neighborhood: 'Overland Park',
      eventDate: '2026-10-01T22:30:00.000Z',
      eventEndDate: '2026-10-02T01:00:00.000Z',
      category: 'Event',
      metadata: {
        ...childMeta,
        listingSourceUrl: 'https://www.downtownop.org/events?utm_source=openai',
        parentArticleUrl: 'https://www.downtownop.org/events?utm_source=openai',
      },
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, true);
  });

  it('keeps Family Shows dated children eligible', () => {
    const item = inventory({
      title: 'Garden Bros Nuclear Circus',
      summary: 'Family circus date in Kansas City.',
      ingest: 'scrape_listing',
      sourceName: 'Family Shows in Kansas City | Schedule 2026–2027',
      sourceUrl: 'https://kc.events/family?utm_source=openai',
      venue: 'Uptown Theater',
      locationName: 'Kansas City, MO',
      neighborhood: 'Kansas City',
      eventDate: '2026-08-24T00:00:00.000Z',
      category: 'Event',
      metadata: {
        ...childMeta,
        listingSourceUrl: 'https://kc.events/family?utm_source=openai',
        parentArticleUrl: 'https://kc.events/family?utm_source=openai',
      },
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, true);
  });

  it('keeps explicit KC metro city/state eligible', () => {
    const item = inventory({
      title: 'The Bowline Brothers at Tin Roof Kansas City',
      summary: null,
      ingest: 'scrape_listing',
      venue: 'Tin Roof Kansas City',
      businessName: 'Tin Roof Kansas City',
      locationName: 'Kansas City',
      formattedAddress: null,
      neighborhood: null,
      eventDate: '2026-08-29T03:00:00.000Z',
      metadata: { ...childMeta, ingest: 'scrape_listing' },
    });
    assert.equal(evaluateInventoryCalendarEligibility(item, NOW).ok, true);
  });

  it('rejects explicit non-KC city/state as wrong_city', () => {
    const item = inventory({
      title: 'Show at Tin Roof',
      summary: null,
      ingest: 'scrape_listing',
      venue: 'Tin Roof',
      businessName: 'Tin Roof',
      locationName: 'Delray Beach, FL',
      formattedAddress: 'Delray Beach, FL',
      neighborhood: null,
      eventDate: '2026-09-04T03:00:00.000Z',
      metadata: { ...childMeta, ingest: 'scrape_listing' },
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
  });

  it('rejects Bowline-style Fort Lauderdale when structured city evidence exists', () => {
    const item = inventory({
      title: 'The Bowline Brothers at Tin Roof Fort Lauderdale',
      summary: null,
      ingest: 'scrape_listing',
      venue: 'Fort Lauderdale',
      businessName: 'Tin Roof Fort Lauderdale',
      locationName: 'Fort Lauderdale',
      formattedAddress: null,
      neighborhood: null,
      eventDate: '2026-09-06T03:00:00.000Z',
      metadata: { ...childMeta, ingest: 'scrape_listing' },
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
  });

  it('rejects Indianapolis/IN structured location as wrong_city', () => {
    const item = inventory({
      title: 'The Bowline Brothers at Tin Roof Indianapolis',
      summary: null,
      ingest: 'scrape_listing',
      venue: 'Indianapolis',
      businessName: 'Tin Roof Indianapolis',
      locationName: 'Indianapolis',
      formattedAddress: null,
      neighborhood: null,
      eventDate: '2026-11-07T04:00:00.000Z',
      metadata: { ...childMeta, ingest: 'scrape_listing' },
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
  });

  it('rejects Panda Fest Chicago even when date is upcoming', () => {
    const item = inventory({
      title: 'Panda Fest Chicago',
      summary: 'Outdoor Asian food festival',
      ingest: 'ask_benson_link',
      venue: 'Butler Field',
      locationName: 'Butler Field, 445 E Monroe St, Chicago, IL 60603',
      formattedAddress: '445 E Monroe St, Chicago, IL 60603',
      neighborhood: null,
      eventDate: '2026-08-30T00:00:00.000Z',
      metadata: { ingest: 'ask_benson_link' },
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
    assert.equal(
      calendarSuggestionIsDisplayable({
        title: 'Panda Fest Chicago',
        location: 'Butler Field, 445 E Monroe St, Chicago, IL 60603',
      }),
      false,
    );
  });

  it('rejects Sporting KC away game when venue is Seattle even though title has KC', () => {
    const item = inventory({
      title: 'Sporting KC II vs. Tacoma Defiance',
      summary: null,
      ingest: 'scrape_listing',
      venue: 'Starfire Sports Complex',
      locationName: 'Starfire Sports Complex, Seattle, WA',
      formattedAddress: 'Starfire Sports Complex, Seattle, WA',
      neighborhood: null,
      eventDate: '2026-08-29T02:00:00.000Z',
      metadata: { ingest: 'scrape_listing' },
    });
    const result = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
    assert.equal(
      calendarSuggestionIsDisplayable({
        title: 'Sporting KC II vs. Tacoma Defiance',
        location: 'Starfire Sports Complex, Seattle, WA',
      }),
      false,
    );
  });

  it('rejects Kansas City Takeover Miami when location is Miami Beach', () => {
    assert.equal(
      calendarSuggestionIsDisplayable({
        title: 'Kansas City Takeover Miami 2026',
        location: 'Miami Beach',
      }),
      false,
    );
  });

  it('keeps KC Panda Fest at Legends Field', () => {
    const item = inventory({
      title: 'Panda Fest 2026',
      summary: 'Outdoor Asian food festival',
      ingest: 'scrape_listing',
      venue: 'Legends Field',
      locationName: 'Legends Field, 1800 Village West Pkwy, Kansas City, KS 66111',
      formattedAddress: '1800 Village West Pkwy, Kansas City, KS 66111',
      neighborhood: null,
      eventDate: '2026-10-09T21:00:00.000Z',
      metadata: { ingest: 'scrape_listing' },
    });
    assert.equal(evaluateInventoryCalendarEligibility(item, NOW).ok, true);
  });

  it('does not falsely reject an ambiguous venue with no city', () => {
    const item = inventory({
      title: 'The Bowline Brothers at Limitless Brewing',
      summary: null,
      ingest: 'scrape_listing',
      venue: 'Limitless Brewing',
      businessName: 'Limitless Brewing',
      locationName: 'Limitless Brewing',
      formattedAddress: null,
      neighborhood: null,
      eventDate: '2026-09-18T00:00:00.000Z',
      metadata: { ...childMeta, ingest: 'scrape_listing' },
    });
    assert.equal(evaluateInventoryCalendarEligibility(item, NOW).ok, true);
  });

  it('does not blindly reject an ambiguous bare city without disambiguation', () => {
    const item = inventory({
      title: 'The Bowline Brothers at Harpos Columbia',
      summary: null,
      ingest: 'scrape_listing',
      venue: 'Columbia',
      businessName: 'Harpos Columbia',
      locationName: 'Columbia',
      formattedAddress: null,
      neighborhood: null,
      eventDate: '2026-10-03T02:00:00.000Z',
      metadata: { ...childMeta, ingest: 'scrape_listing' },
    });
    assert.equal(evaluateInventoryCalendarEligibility(item, NOW).ok, true);
  });
});

describe('calendar curator-lead eligibility', () => {
  const lead = {
    id: '00000000-0000-4000-8000-000000000501',
    eventName: '2 Steppin’ Matinee',
    eventDate: '2026-09-16',
    eventTime: '2pm',
    venue: 'Culture X Lounge',
    neighborhood: 'Kansas City',
    verificationStatus: 'PARTIALLY_VERIFIED',
    dismissedAt: null,
    discoveredViaHandle: 'jasfoodjourney',
    discoveredViaPostUrl: 'https://www.instagram.com/p/abc/',
    officialOrganizerUrl: null,
    officialVenueUrl: null,
    ticketUrl: null,
    officialSocialUrl: null,
    linkedContentItemId: null,
    watcherId: '00000000-0000-4000-8000-000000000601',
    occurrenceFingerprint: 'fp-steppin',
  };

  it('accepts a partially verified Watchlist lead with a future date', () => {
    assert.equal(evaluateCuratorLeadCalendarEligibility(lead, NOW).ok, true);
    const candidate = candidateFromCuratorLead(lead);
    assert.ok(candidate);
    assert.equal(candidate!.verificationState, 'PARTIALLY_VERIFIED');
    assert.match(candidate!.whyIncluded ?? '', /Instagram Watchlist/i);
    assert.equal(calendarVerificationDisplay(candidate!.verificationState), 'needs_verification');
  });

  it('accepts a verified Watchlist lead', () => {
    const verified = { ...lead, eventName: 'Wine Down Sundays', venue: 'Juke House', verificationStatus: 'VERIFIED' };
    assert.equal(evaluateCuratorLeadCalendarEligibility(verified, NOW).ok, true);
    assert.equal(calendarVerificationDisplay('VERIFIED'), 'verified');
  });

  it('rejects an expired Watchlist lead', () => {
    const result = evaluateCuratorLeadCalendarEligibility({ ...lead, verificationStatus: 'EXPIRED' }, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'expired');
  });

  it('rejects a dismissed Watchlist lead', () => {
    const result = evaluateCuratorLeadCalendarEligibility({ ...lead, dismissedAt: NOW }, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'dismissed');
  });

  it('rejects a wrong-city Watchlist lead', () => {
    const result = evaluateCuratorLeadCalendarEligibility(
      { ...lead, venue: 'Chicago', neighborhood: 'Chicago, IL', eventName: 'Chicago Riverwalk Party' },
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
  });

  it('rejects an Orlando Watchlist headline even when venue is Kansas City', () => {
    const result = evaluateCuratorLeadCalendarEligibility(
      {
        ...lead,
        eventName: 'Rising country star Megan Moroney rolls into Orlando',
        venue: 'Kansas City',
        neighborhood: 'Kansas City',
      },
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'wrong_city');
  });

  it('rejects a Watchlist lead whose stored date contradicts an explicit weekday', () => {
    const result = evaluateCuratorLeadCalendarEligibility(
      {
        ...lead,
        eventName: 'Ernest Melton opens the Monday Night Jam',
        eventDate: '2026-09-05',
        dayHeading: 'Monday',
      },
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, 'weekday_contradiction');
  });

  it('accepts the same Monday Night Jam once the date falls on Monday', () => {
    const result = evaluateCuratorLeadCalendarEligibility(
      {
        ...lead,
        eventName: 'Ernest Melton opens the Monday Night Jam',
        eventDate: '2026-09-07',
        dayHeading: 'Monday',
      },
      NOW,
    );
    assert.equal(result.ok, true);
  });

  it('parses 2pm on Sep 16 as a Chicago afternoon instant', () => {
    const start = calendarStartAtFromDateTime('2026-09-16', '2pm');
    assert.ok(start);
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(start);
    assert.equal(Number(hour), 14);
  });
});

describe('candidateFromInventory calendarCategory stamp', () => {
  it('stamps estate_sale from structured flags without using the title', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'Saturday finds — Prairie Village',
        category: 'luxury_deal',
        flags: { ...inventory().flags, estateSale: true },
        metadata: { estateSaleFlag: true },
      }),
    );
    assert.equal(candidate.metadata?.calendarCategory, 'estate_sale');
  });

  it('does not stamp vintage markets as estate_sale', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'Vintage market at Crossroads',
        category: 'vintage_market',
        flags: { ...inventory().flags, vendorMarket: true },
      }),
    );
    assert.equal(candidate.metadata?.calendarCategory ?? null, null);
  });
});

describe('candidateFromInventory allDay from temporal evidence', () => {
  it('HPNA General Meeting: T00Z with startTime 19:00:00 is not all-day', () => {
    const item = inventory({
      title: 'HPNA General Meeting',
      eventDate: '2026-09-16T00:00:00.000Z',
      temporalEvidence: {
        eventDate: '2026-09-15T19:00:00',
        eventEndDate: null,
        startTime: '19:00:00',
      },
    });
    const candidate = candidateFromInventory(item);
    assert.equal(candidate.startAt, '2026-09-16T00:00:00.000Z');
    assert.equal(candidate.allDay, false);
    assert.equal(inventoryCalendarAllDay(item, new Date(item.eventDate!)), false);
  });

  it('HPNA Beautification: T00Z with startTime 18:00:00 is not all-day', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'HPNA Beautification Monthly Meeting',
        eventDate: '2026-11-19T00:00:00.000Z',
        temporalEvidence: {
          eventDate: '2026-11-18T18:00:00',
          eventEndDate: null,
          startTime: '18:00:00',
        },
      }),
    );
    assert.equal(candidate.allDay, false);
  });

  it('Big 12 Session 2: T00Z with startTime 18:00:00 is not all-day', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'Big 12 Session 2',
        eventDate: '2027-03-10T00:00:00.000Z',
        temporalEvidence: {
          eventDate: '2027-03-09T18:00:00',
          eventEndDate: null,
          startTime: '18:00:00',
        },
      }),
    );
    assert.equal(candidate.allDay, false);
  });

  it('Come From Away: T00Z with startTime 19:00:00 is not all-day', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'Come From Away',
        eventDate: '2026-09-02T00:00:00.000Z',
        temporalEvidence: {
          eventDate: '2026-09-02T19:00:00',
          eventEndDate: null,
          startTime: '19:00:00',
        },
      }),
    );
    assert.equal(candidate.allDay, false);
  });

  it('true date-only OPCC: bare eventDate + null startTime is all-day', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'Woman of Influence',
        eventDate: '2026-08-28T00:00:00.000Z',
        temporalEvidence: {
          eventDate: '2026-08-28',
          eventEndDate: null,
          startTime: null,
        },
      }),
    );
    assert.equal(candidate.allDay, true);
  });

  it('ordinary timed non-midnight event stays allDay=false', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'Wine Down Sundays',
        eventDate: '2026-09-16T17:00:00.000Z',
        temporalEvidence: null,
      }),
    );
    assert.equal(candidate.allDay, false);
  });

  it('missing evidence preserves UTC-midnight fallback (allDay=true)', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'Unknown midnight stamp',
        eventDate: '2026-10-01T00:00:00.000Z',
        temporalEvidence: null,
        metadata: {},
      }),
    );
    assert.equal(candidate.allDay, true);
  });

  it('missing evidence with non-midnight instant stays allDay=false', () => {
    const candidate = candidateFromInventory(
      inventory({
        title: 'Unknown afternoon stamp',
        eventDate: '2026-10-01T18:30:00.000Z',
        temporalEvidence: null,
        metadata: {},
      }),
    );
    assert.equal(candidate.allDay, false);
  });
});
