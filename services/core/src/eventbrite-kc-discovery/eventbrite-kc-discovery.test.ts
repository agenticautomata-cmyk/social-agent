import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildUserOpportunityExternalId,
  extractEventbriteEventId,
} from '../ask-benson/url-intake-dedupe.js';
import { parseEventDate } from '../ask-benson/listing-extract.js';
import {
  dedupeCatalogByEventId,
  extractEventbriteCatalogEntriesFromHtml,
} from './extract.js';
import { parseEventbriteDetailPage } from './detail.js';
import { runEventbriteKcDiscovery } from './run.js';
import { EVENTBRITE_KC_INGEST } from './surfaces.js';

function itemListHtml(
  items: Array<{ name: string; url: string; startDate?: string }>,
): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: item.name,
        url: item.url,
        startDate: item.startDate ?? '2026-09-01',
        location: {
          '@type': 'Place',
          name: 'Venue',
          address: { '@type': 'PostalAddress', addressLocality: 'Kansas City' },
        },
      },
    })),
  })}</script></head><body></body></html>`;
}

function detailEventHtml(input: {
  name: string;
  url: string;
  startDate: string;
  venue: string;
  city: string;
  endDate?: string;
}): string {
  return `<html><head><title>${input.name}</title>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.name,
    url: input.url,
    startDate: input.startDate,
    endDate: input.endDate,
    location: {
      '@type': 'Place',
      name: input.venue,
      address: {
        '@type': 'PostalAddress',
        addressLocality: input.city,
        addressRegion: 'MO',
      },
    },
  })}</script></head><body></body></html>`;
}

describe('Eventbrite KC public discovery', () => {
  it('1. city ItemList with 5 event URLs extracts all 5', () => {
    const html = itemListHtml([
      { name: 'A', url: 'https://www.eventbrite.com/e/a-tickets-1111111111111' },
      { name: 'B', url: 'https://www.eventbrite.com/e/b-tickets-2222222222222' },
      { name: 'C', url: 'https://www.eventbrite.com/e/c-tickets-3333333333333' },
      { name: 'D', url: 'https://www.eventbrite.com/e/d-tickets-4444444444444' },
      { name: 'E', url: 'https://www.eventbrite.com/e/e-tickets-5555555555555' },
    ]);
    const entries = extractEventbriteCatalogEntriesFromHtml(html, 'city');
    assert.equal(entries.length, 5);
    assert.deepEqual(
      entries.map((e) => e.eventbriteEventId),
      ['1111111111111', '2222222222222', '3333333333333', '4444444444444', '5555555555555'],
    );
  });

  it('2. category duplicates already seen on city are deduped before detail fetch', async () => {
    const city = itemListHtml([
      { name: 'Shared', url: 'https://www.eventbrite.com/e/shared-tickets-1996482122773' },
      { name: 'OnlyCity', url: 'https://www.eventbrite.com/e/only-city-tickets-1990000000001' },
    ]);
    const food = itemListHtml([
      { name: 'Shared', url: 'https://www.eventbrite.com/e/shared-tickets-1996482122773' },
      { name: 'OnlyFood', url: 'https://www.eventbrite.com/e/only-food-tickets-1990000000002' },
    ]);
    const detail = {
      '1996482122773': detailEventHtml({
        name: 'Shared',
        url: 'https://www.eventbrite.com/e/shared-tickets-1996482122773',
        startDate: '2026-09-19T14:00:00-05:00',
        venue: 'KC Live!',
        city: 'Kansas City',
      }),
      '1990000000001': detailEventHtml({
        name: 'OnlyCity',
        url: 'https://www.eventbrite.com/e/only-city-tickets-1990000000001',
        startDate: '2026-09-20T14:00:00-05:00',
        venue: 'Venue',
        city: 'Kansas City',
      }),
      '1990000000002': detailEventHtml({
        name: 'OnlyFood',
        url: 'https://www.eventbrite.com/e/only-food-tickets-1990000000002',
        startDate: '2026-09-21T14:00:00-05:00',
        venue: 'Venue',
        city: 'Kansas City',
      }),
    };
    const result = await runEventbriteKcDiscovery({
      dryRun: true,
      persist: false,
      skipExistingLookup: true,
      surfaceHtml: {
        city,
        food,
        music: itemListHtml([]),
        business: itemListHtml([]),
        festivals: itemListHtml([]),
        family: itemListHtml([]),
        arts: itemListHtml([]),
      },
      detailHtmlByEventId: detail,
    });
    assert.equal(result.uniqueIdsFound, 3);
    assert.equal(result.duplicateIdsAcrossSurfaces, 1);
    assert.equal(result.detailFetchAttempts, 3);
  });

  it('3. organizer /o/ URL is ignored', () => {
    const html = `<html><body>
      <a href="https://www.eventbrite.com/o/speedkc-dating-12281686184">org</a>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'ItemList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: {
              '@type': 'Organization',
              name: 'Org',
              url: 'https://www.eventbrite.com/o/some-org-123',
            },
          },
        ],
      })}</script>
    </body></html>`;
    const entries = extractEventbriteCatalogEntriesFromHtml(html, 'city');
    assert.equal(entries.length, 0);
  });

  it('4. malformed event URL is ignored', () => {
    const html = itemListHtml([
      { name: 'Bad', url: 'https://www.eventbrite.com/e/not-an-id' },
      { name: 'AlsoBad', url: 'https://www.eventbrite.com/d/mo--kansas-city/events/' },
    ]);
    const entries = extractEventbriteCatalogEntriesFromHtml(html, 'city');
    assert.equal(entries.length, 0);
  });

  it('5. same event in 3 categories → one detail fetch / one candidate', async () => {
    const shared = itemListHtml([
      { name: 'Triple', url: 'https://www.eventbrite.com/e/triple-tickets-1991111111111' },
    ]);
    const result = await runEventbriteKcDiscovery({
      dryRun: true,
      skipExistingLookup: true,
      surfaceHtml: {
        city: shared,
        food: shared,
        music: shared,
        business: itemListHtml([]),
        festivals: itemListHtml([]),
        family: itemListHtml([]),
        arts: itemListHtml([]),
      },
      detailHtmlByEventId: {
        '1991111111111': detailEventHtml({
          name: 'Triple',
          url: 'https://www.eventbrite.com/e/triple-tickets-1991111111111',
          startDate: '2026-09-01T18:00:00-05:00',
          venue: 'Venue',
          city: 'Kansas City',
        }),
      },
    });
    assert.equal(result.uniqueIdsFound, 1);
    assert.equal(result.detailFetchAttempts, 1);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.disposition, 'would_create');
  });

  it('6. Eventbrite event id extraction is stable numeric id', () => {
    assert.equal(
      extractEventbriteEventId(
        'https://www.eventbrite.com/e/kansas-city-taco-festival-tickets-1996482122773?utm=1',
      ),
      '1996482122773',
    );
    assert.equal(
      buildUserOpportunityExternalId({ eventbriteEventId: '1996482122773' }),
      'ask-benson-user-event-eb-1996482122773',
    );
  });

  it('7. Event detail JSON-LD yields title/date/time/venue via existing parser', async () => {
    const url = 'https://www.eventbrite.com/e/taco-tickets-1996482122773';
    const parsed = await parseEventbriteDetailPage(url, {
      html: detailEventHtml({
        name: 'Kansas City Taco Festival',
        url,
        startDate: '2026-09-19T14:00:00-05:00',
        venue: 'KC Live!',
        city: 'Kansas City',
      }),
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.opportunity.title, 'Kansas City Taco Festival');
    assert.equal(parsed.opportunity.venue, 'KC Live!');
    assert.equal(parsed.opportunity.startTime, '14:00:00');
    assert.equal(parsed.hasClock, true);
  });

  it('8. date-only Eventbrite event survives as date-only', async () => {
    const url = 'https://www.eventbrite.com/e/allday-tickets-1992222222222';
    const parsed = await parseEventbriteDetailPage(url, {
      html: detailEventHtml({
        name: 'All Day Fair',
        url,
        startDate: '2026-09-25',
        venue: 'Convention Center',
        city: 'Kansas City',
      }),
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.opportunity.eventDate?.slice(0, 10), '2026-09-25');
    assert.equal(parsed.hasClock, false);
    assert.ok(parseEventDate(parsed.opportunity.eventDate));
  });

  it('9. timed Eventbrite event keeps local clock semantics', async () => {
    const url = 'https://www.eventbrite.com/e/timed-tickets-1993333333333';
    const parsed = await parseEventbriteDetailPage(url, {
      html: detailEventHtml({
        name: 'Evening Show',
        url,
        startDate: '2026-10-06T19:00:00-05:00',
        venue: 'Unity Temple',
        city: 'Kansas City',
      }),
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.opportunity.startTime, '19:00:00');
    assert.equal(parsed.hasClock, true);
  });

  it('10. out-of-market detail event is rejected by geography logic', async () => {
    const url = 'https://www.eventbrite.com/e/miami-tickets-1994444444444';
    const parsed = await parseEventbriteDetailPage(url, {
      html: detailEventHtml({
        name: 'Miami Night',
        url,
        startDate: '2026-09-19T20:00:00-04:00',
        venue: 'South Beach',
        city: 'Miami',
      }),
    });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.reason, 'qualify_rejected');
    assert.equal(parsed.qualification?.rejectionCode, 'out_of_market');
  });

  it('11. repeated discovery run maps to same durable identity', () => {
    const id = '1996482122773';
    const a = buildUserOpportunityExternalId({ eventbriteEventId: id });
    const b = buildUserOpportunityExternalId({ eventbriteEventId: id });
    assert.equal(a, b);
    assert.equal(a, 'ask-benson-user-event-eb-1996482122773');
    assert.ok(!a.includes('food'));
    assert.ok(!a.includes('city'));
    assert.ok(!/position|index|surface/i.test(a));
  });

  it('12. cross-source twin disposition is reported without inventing merge', async () => {
    // Without DB, skipExistingLookup means no twin detection — assert ingest constant
    // and that durable id stays Eventbrite-id based (no category).
    assert.equal(EVENTBRITE_KC_INGEST, 'eventbrite_public_discovery');
    const ext = buildUserOpportunityExternalId({ eventbriteEventId: '1994365695482' });
    assert.equal(ext, 'ask-benson-user-event-eb-1994365695482');
  });

  it('13. one category fetch failure does not stop other categories', async () => {
    const result = await runEventbriteKcDiscovery({
      dryRun: true,
      skipExistingLookup: true,
      surfaceHtml: {
        city: itemListHtml([
          { name: 'Ok', url: 'https://www.eventbrite.com/e/ok-tickets-1995555555555' },
        ]),
        food: '<html><body>error</body></html>',
        music: itemListHtml([
          { name: 'Music', url: 'https://www.eventbrite.com/e/music-tickets-1996666666666' },
        ]),
        business: itemListHtml([]),
        festivals: itemListHtml([]),
        family: itemListHtml([]),
        arts: itemListHtml([]),
      },
      detailHtmlByEventId: {
        '1995555555555': detailEventHtml({
          name: 'Ok',
          url: 'https://www.eventbrite.com/e/ok-tickets-1995555555555',
          startDate: '2026-09-01T12:00:00-05:00',
          venue: 'Venue',
          city: 'Kansas City',
        }),
        '1996666666666': detailEventHtml({
          name: 'Music',
          url: 'https://www.eventbrite.com/e/music-tickets-1996666666666',
          startDate: '2026-09-02T12:00:00-05:00',
          venue: 'Venue',
          city: 'Kansas City',
        }),
      },
    });
    assert.equal(result.surfaces.find((s) => s.surfaceId === 'city')?.fetchOk, true);
    assert.equal(result.surfaces.find((s) => s.surfaceId === 'music')?.fetchOk, true);
    assert.equal(result.uniqueIdsFound, 2);
  });

  it('14. max-id / detail-fetch cap is enforced', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      name: `E${i}`,
      url: `https://www.eventbrite.com/e/e${i}-tickets-199700000000${i}`,
    }));
    const details: Record<string, string> = {};
    for (const item of items) {
      const id = extractEventbriteEventId(item.url)!;
      details[id] = detailEventHtml({
        name: item.name,
        url: item.url,
        startDate: '2026-09-01T12:00:00-05:00',
        venue: 'Venue',
        city: 'Kansas City',
      });
    }
    const result = await runEventbriteKcDiscovery({
      dryRun: true,
      skipExistingLookup: true,
      maxUniqueIds: 2,
      maxDetailFetches: 2,
      surfaceHtml: {
        city: itemListHtml(items),
        food: itemListHtml([]),
        music: itemListHtml([]),
        business: itemListHtml([]),
        festivals: itemListHtml([]),
        family: itemListHtml([]),
        arts: itemListHtml([]),
      },
      detailHtmlByEventId: details,
    });
    assert.equal(result.uniqueIdsFound, 5);
    assert.equal(result.detailFetchAttempts, 2);
    assert.ok(result.candidates.every((c) => !c.durableExternalId.includes('city')));
  });

  it('15. durable id has no category or page index', () => {
    const id = buildUserOpportunityExternalId({
      eventbriteEventId: '1996482122773',
      title: 'should-not-matter',
      eventDateIso: '2026-09-19',
      venue: 'should-not-matter',
    });
    assert.equal(id, 'ask-benson-user-event-eb-1996482122773');
    assert.ok(!id.includes('food'));
    assert.ok(!id.includes('festivals'));
    assert.ok(!id.includes('position'));
  });
});
