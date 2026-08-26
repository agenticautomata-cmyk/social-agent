import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventDate, slugify } from './listing-extract.js';
import {
  buildListingContainerChildExternalId,
  containerChildrenShareIdentity,
  listingChildHasStableDetailUrl,
  listingContainerLocalDayKey,
  listingUrlsEquivalent,
  resolveListingScrapeExternalId,
} from './container-child-persist.js';

const HUB = 'https://www.downtownop.org/events?utm_source=openai';

describe('container child persist identity', () => {
  it('same hub URL + different title/date produce different internal ids', () => {
    const farmers = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: 'Overland Park Farmers Market',
      eventDate: '2026-04-18T12:30:00.000Z',
      venue: 'Matt Ross Community Center',
    });
    const movie = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: 'Movie Night',
      eventDate: '2026-09-12T23:00:00.000Z',
      venue: 'Clock Tower Plaza',
    });
    assert.notEqual(farmers, movie);
    assert.match(farmers, /^scrape_listing-[0-9a-f]{16}-overland-park-farmers-market-2026-04-18-/);
    assert.match(movie, /^scrape_listing-[0-9a-f]{16}-movie-night-2026-09-12-/);
    assert.doesNotMatch(farmers, /#/);
    assert.doesNotMatch(movie, /downtownop\.org\/events/);
  });

  it('same hub + same title/date/venue is a stable identity', () => {
    const a = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: 'Third Fridays',
      eventDate: '2026-08-21T22:00:00.000Z',
      venue: 'Downtown Overland Park',
    });
    const b = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: 'Third Fridays',
      eventDate: '2026-08-21T22:00:00.000Z',
      venue: 'Downtown Overland Park',
    });
    assert.equal(a, b);
  });

  it('same title on a different day is a different identity', () => {
    const fridayAug = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: 'Third Fridays',
      eventDate: '2026-08-21T22:00:00.000Z',
    });
    const fridayJul = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: 'Third Fridays',
      eventDate: '2026-07-17T22:00:00.000Z',
    });
    assert.notEqual(fridayAug, fridayJul);
  });

  it('consecutive local nights at 10 PM do not collapse when UTC calendar day overlaps', () => {
    const tourTitle = 'The Bowline Brothers at Tin Roof Delray Beach';
    const venue = 'Tin Roof Delray Beach';
    const sep3 = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: 'https://www.bowlinebrothers.com/shows',
      title: tourTitle,
      eventDate: '2026-09-03T22:00:00',
      venue,
    });
    const sep4 = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: 'https://www.bowlinebrothers.com/shows',
      title: tourTitle,
      eventDate: '2026-09-04T22:00:00',
      venue,
    });
    assert.notEqual(sep3, sep4);
    assert.match(sep3, /-2026-09-03-/);
    assert.match(sep4, /-2026-09-04-/);

    const night1Stored = {
      topic: tourTitle,
      eventStartsAt: parseEventDate('2026-09-03T22:00:00'),
      eventDate: '2026-09-03T22:00:00',
      locationName: 'Delray Beach',
    };
    assert.equal(
      containerChildrenShareIdentity(
        {
          title: tourTitle,
          eventStartsAt: parseEventDate('2026-09-04T22:00:00'),
          eventDate: '2026-09-04T22:00:00',
          venue,
        },
        night1Stored,
      ),
      false,
    );
    assert.equal(listingContainerLocalDayKey({ eventDate: '2026-09-03T22:00:00' }), '2026-09-03');
    assert.equal(
      listingContainerLocalDayKey({ eventStartsAt: parseEventDate('2026-09-03T22:00:00') }),
      '2026-09-03',
    );
  });

  it('same child re-ingested reconciles one row', () => {
    const shared = {
      title: 'Third Fridays',
      eventDate: '2026-08-21T17:00:00',
      eventStartsAt: parseEventDate('2026-08-21T17:00:00'),
      venue: 'Downtown Overland Park',
    };
    assert.equal(
      containerChildrenShareIdentity(
        { ...shared, title: 'Third Fridays' },
        {
          topic: 'Third Fridays',
          eventStartsAt: parseEventDate('2026-08-21T17:00:00'),
          eventDate: '2026-08-21T17:00:00',
          locationName: 'Downtown Overland Park',
        },
      ),
      true,
    );
  });

  it('same local day reconciles across equivalent UTC storage', () => {
    assert.equal(
      containerChildrenShareIdentity(
        {
          title: 'Movie Night',
          eventDate: '2026-09-12T19:00:00',
          eventStartsAt: parseEventDate('2026-09-12T19:00:00'),
          venue: 'Clock Tower Plaza',
        },
        {
          topic: 'Movie Night',
          eventStartsAt: parseEventDate('2026-09-12T19:00:00'),
          eventDate: '2026-09-12T19:00:00',
          locationName: 'Clock Tower Plaza',
        },
      ),
      true,
    );
  });

  it('daytime shared-hub child behavior is unchanged', () => {
    assert.equal(
      listingContainerLocalDayKey({ eventDate: '2026-04-18T07:30:00' }),
      '2026-04-18',
    );
    const external = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: 'Overland Park Farmers Market',
      eventDate: '2026-04-18T07:30:00',
      venue: 'Matt Ross Community Center',
    });
    assert.match(external, /-2026-04-18-/);
  });

  it('does not treat the hub URL as a unique child URL', () => {
    assert.equal(
      listingUrlsEquivalent(HUB, 'https://downtownop.org/events'),
      true,
    );
    assert.equal(
      containerChildrenShareIdentity(
        {
          title: 'Movie Night',
          eventStartsAt: new Date('2026-09-12T23:00:00.000Z'),
          eventDate: '2026-09-12T18:00:00',
          venue: 'Clock Tower Plaza',
        },
        {
          topic: 'Movie Night',
          eventStartsAt: new Date('2026-09-12T18:00:00.000Z'),
          eventDate: '2026-09-12T18:00:00',
          locationName: 'Clock Tower Plaza',
        },
      ),
      true,
    );
    assert.equal(
      containerChildrenShareIdentity(
        {
          title: 'Movie Night',
          eventStartsAt: new Date('2026-09-12T23:00:00.000Z'),
          eventDate: '2026-09-12T18:00:00',
          venue: 'Clock Tower Plaza',
        },
        {
          topic: 'Movie Night',
          eventStartsAt: new Date('2026-09-12T23:00:00.000Z'),
          eventDate: '2026-09-12T18:00:00',
          locationName: 'Clock Tower Plaza',
        },
      ),
      true,
    );
    assert.equal(
      containerChildrenShareIdentity(
        {
          title: 'Movie Night',
          eventStartsAt: new Date('2026-09-12T23:00:00.000Z'),
        },
        {
          topic: 'Overland Park Farmers Market',
          eventStartsAt: new Date('2026-04-18T12:30:00.000Z'),
          locationName: 'Matt Ross Community Center',
        },
      ),
      false,
    );
  });
});

/** Proven UNSTABLE listing identity: ingest + listing hash + extraction index + title slug. */
function legacyListingIndexExternalId(listingUrl: string, index: number, title: string): string {
  const batchId = createHash('sha256').update(listingUrl).digest('hex').slice(0, 16);
  return `scrape_listing-${batchId}-${index}-${slugify(title)}`;
}

const OPCC_HUB = 'https://opconventioncenter.com/events/';
const INSPIRING = 'Inspiring Women in Public Administration Conference 2026';
const OPCC_VENUE = 'Overland Park Convention Center';
const INSPIRING_DAY = '2026-08-21T08:00:00';

describe('listing child durable identity — index-free', () => {
  it('1. same logical child at index 1 vs 7 keeps the same durable id', () => {
    const identity = {
      ingest: 'scrape_listing' as const,
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: INSPIRING_DAY,
      venue: OPCC_VENUE,
    };
    const at1 = resolveListingScrapeExternalId(identity);
    const at7 = resolveListingScrapeExternalId(identity);
    assert.equal(at1, at7);
    assert.doesNotMatch(at1, /-(?:1|7)-inspiring-women/);
    assert.notEqual(legacyListingIndexExternalId(OPCC_HUB, 1, INSPIRING), legacyListingIndexExternalId(OPCC_HUB, 7, INSPIRING));
    assert.match(legacyListingIndexExternalId(OPCC_HUB, 1, INSPIRING), /-1-inspiring-women/);
    assert.match(legacyListingIndexExternalId(OPCC_HUB, 7, INSPIRING), /-7-inspiring-women/);
    assert.match(at1, /^scrape_listing-[0-9a-f]{16}-inspiring-women-in-public-administration-confere-2026-08-21-/);
  });

  it('2. listing reorder maps all three children back to original durable ids', () => {
    const children = [
      { title: 'Alpha Forum', eventDate: '2026-09-01T09:00:00', venue: OPCC_VENUE },
      { title: 'Beta Summit', eventDate: '2026-09-02T09:00:00', venue: OPCC_VENUE },
      { title: 'Gamma Expo', eventDate: '2026-09-03T09:00:00', venue: OPCC_VENUE },
    ];
    const scrapeA = children.map((c, i) => ({
      index: i,
      id: resolveListingScrapeExternalId({ ingest: 'scrape_listing', listingUrl: OPCC_HUB, ...c }),
      legacy: legacyListingIndexExternalId(OPCC_HUB, i, c.title),
    }));
    const scrapeBOrder = [children[2]!, children[0]!, children[1]!];
    const scrapeB = scrapeBOrder.map((c, i) => ({
      index: i,
      id: resolveListingScrapeExternalId({ ingest: 'scrape_listing', listingUrl: OPCC_HUB, ...c }),
      legacy: legacyListingIndexExternalId(OPCC_HUB, i, c.title),
    }));
    assert.equal(scrapeB[0]!.id, scrapeA[2]!.id);
    assert.equal(scrapeB[1]!.id, scrapeA[0]!.id);
    assert.equal(scrapeB[2]!.id, scrapeA[1]!.id);
    assert.notEqual(scrapeB[0]!.legacy, scrapeA[2]!.legacy);
    assert.notEqual(scrapeB[1]!.legacy, scrapeA[0]!.legacy);
  });

  it('3. new child inserted above existing children does not change their ids', () => {
    const existing = [
      { title: 'Kept One', eventDate: '2026-10-01T10:00:00', venue: OPCC_VENUE },
      { title: 'Kept Two', eventDate: '2026-10-02T10:00:00', venue: OPCC_VENUE },
    ];
    const before = existing.map((c) =>
      resolveListingScrapeExternalId({ ingest: 'scrape_listing', listingUrl: OPCC_HUB, ...c }),
    );
    const inserted = { title: 'Brand New Child', eventDate: '2026-09-30T10:00:00', venue: OPCC_VENUE };
    const after = [inserted, ...existing].map((c) =>
      resolveListingScrapeExternalId({ ingest: 'scrape_listing', listingUrl: OPCC_HUB, ...c }),
    );
    assert.equal(after[1], before[0]);
    assert.equal(after[2], before[1]);
    assert.notEqual(after[0], before[0]);
    assert.notEqual(after[0], before[1]);
    const legacyBefore = existing.map((c, i) => legacyListingIndexExternalId(OPCC_HUB, i, c.title));
    const legacyAfter = [inserted, ...existing].map((c, i) =>
      legacyListingIndexExternalId(OPCC_HUB, i, c.title),
    );
    assert.notEqual(legacyAfter[1], legacyBefore[0]);
    assert.notEqual(legacyAfter[2], legacyBefore[1]);
  });

  it('4. same title on a different local day is a different identity', () => {
    const a = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: '2026-08-21T08:00:00',
      venue: OPCC_VENUE,
    });
    const b = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: '2026-08-22T08:00:00',
      venue: OPCC_VENUE,
    });
    assert.notEqual(a, b);
    assert.match(a, /-2026-08-21-/);
    assert.match(b, /-2026-08-22-/);
  });

  it('5. same title + same day + different venue is a different identity', () => {
    const opcc = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: INSPIRING_DAY,
      venue: OPCC_VENUE,
    });
    const downtown = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: INSPIRING_DAY,
      venue: 'Clock Tower Plaza',
    });
    assert.notEqual(opcc, downtown);
  });

  it('6. same title + same day + same venue is stable across re-ingest', () => {
    const first = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: INSPIRING_DAY,
      venue: OPCC_VENUE,
    });
    const second = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: INSPIRING_DAY,
      venue: OPCC_VENUE,
    });
    assert.equal(first, second);
  });

  it('7. evening local-day identity uses intended local day, not UTC sliced day', () => {
    const eventDate = '2026-08-21T22:00:00';
    const storedUtc = parseEventDate(eventDate);
    assert.equal(storedUtc?.toISOString().slice(0, 10), '2026-08-22');
    const id = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: 'Late Night Mixer',
      eventDate,
      venue: OPCC_VENUE,
    });
    assert.match(id, /-2026-08-21-/);
    assert.doesNotMatch(id, /-2026-08-22-/);
    assert.equal(listingContainerLocalDayKey({ eventDate }), '2026-08-21');
    assert.equal(listingContainerLocalDayKey({ eventStartsAt: storedUtc }), '2026-08-21');
  });

  it('8. shared-hub children still share identity when hub URL is provenance only', () => {
    const hub = 'https://www.downtownop.org/events?utm_source=openai';
    const id = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: hub,
      title: 'Movie Night',
      eventDate: '2026-09-12T18:00:00',
      venue: 'Clock Tower Plaza',
    });
    assert.match(id, /^scrape_listing-[0-9a-f]{16}-movie-night-2026-09-12-/);
    assert.equal(
      containerChildrenShareIdentity(
        {
          title: 'Movie Night',
          eventStartsAt: parseEventDate('2026-09-12T18:00:00'),
          eventDate: '2026-09-12T18:00:00',
          venue: 'Clock Tower Plaza',
          listingUrl: hub,
        },
        {
          topic: 'Movie Night',
          eventStartsAt: parseEventDate('2026-09-12T18:00:00'),
          eventDate: '2026-09-12T18:00:00',
          locationName: 'Clock Tower Plaza',
        },
      ),
      true,
    );
  });

  it('9. OPCC-style detail URL remains the preferred persist match, not a new id framework', () => {
    const detail =
      'https://opconventioncenter.com/events/inspiring-women-in-public-administration-conference-2026/';
    const withDetail = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: INSPIRING_DAY,
      venue: OPCC_VENUE,
    });
    const listingOnly = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: INSPIRING_DAY,
      venue: OPCC_VENUE,
    });
    assert.equal(withDetail, listingOnly);
    assert.equal(listingChildHasStableDetailUrl(OPCC_HUB, detail), true);
    assert.equal(listingChildHasStableDetailUrl(OPCC_HUB, OPCC_HUB), false);
    assert.equal(listingChildHasStableDetailUrl(detail, detail), false);
  });

  it('parent hub row is index-free and distinct from child occurrence ids', () => {
    const parent = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: 'Events Archive',
      isParentContainerRow: true,
    });
    const child = resolveListingScrapeExternalId({
      ingest: 'scrape_listing',
      listingUrl: OPCC_HUB,
      title: INSPIRING,
      eventDate: INSPIRING_DAY,
      venue: OPCC_VENUE,
    });
    assert.match(parent, /-parent-events-archive$/);
    assert.doesNotMatch(parent, /-\d+-events-archive/);
    assert.notEqual(parent, child);
  });
});
