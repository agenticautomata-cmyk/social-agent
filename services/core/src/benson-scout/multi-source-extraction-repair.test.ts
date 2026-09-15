/**
 * Multi-source extraction repair regressions (generalized fixtures — no domain hard-coding).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { extractEventListingsFromHtml, urlLooksLikeEventListing } from './event-listing-extract.js';
import { inspectSubmittedUrl } from './url-inspect.js';
import { extractFromEmbeddedJsonEvents } from './embedded-json-events-extract.js';
import { reconcileSurfaceYields } from './surface-reconcile.js';
import { classifyListingSourceOverlap, listingFeedSiblingOf } from './source-overlap.js';
import { extractEventsFromFeedXml } from './adaptive-extraction/feed-extract.js';
import { planHtmlCalendarPageFetches } from './html-calendar-extract.js';
import { extractFromTribeEventsListHtml } from './wordpress-tec-extract.js';
import { decodeHtmlEntitiesDeterministic } from '../text-sanitize/sanitize-scraped-text.js';
import { scoreEventTitleLine } from '../curator-watchlist/instagram-visual/caption-event-extract.js';
import { assessLocationTrust } from '../curator-watchlist/instagram-visual/location-trust.js';
import { buildAttributionLine } from '../curator-watchlist/slide-ocr.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

describe('event-calendar path classification', () => {
  it('classifies /event-calendar/ as event_listing', () => {
    const url = 'https://example.org/event-calendar/';
    assert.equal(urlLooksLikeEventListing(url), true);
    assert.equal(inspectSubmittedUrl(url).extractionMethod, 'event_listing');
  });
});

describe('TEC list without type-tribe_events token', () => {
  it('extracts list cards that only carry tribe-events-calendar-list__event', () => {
    const html = `<html><body>
<article class="tribe-events-calendar-list__event post-1 tribe_events">
  <h3 class="tribe-events-calendar-list__event-title">
    <a href="https://example.org/event-calendar/baby-j/" class="tribe-events-calendar-list__event-title-link">Baby J Duo</a>
  </h3>
  <time class="tribe-events-calendar-list__event-datetime" datetime="2026-09-15">September 15 @ 6:00 pm - 10:00 pm</time>
  <span class="tribe-events-calendar-list__event-venue-title">Chaz Restaurant</span>
  <span class="tribe-events-calendar-list__event-venue-address">325 Ward Parkway</span>
</article>
</body></html>`;
    const events = extractFromTribeEventsListHtml(html, 'https://example.org/event-calendar/');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.title, 'Baby J Duo');
    assert.equal(events[0]!.startDate, '2026-09-15');
    assert.equal(events[0]!.startDateTime, '2026-09-15T18:00:00');
    assert.equal(events[0]!.venue, 'Chaz Restaurant');
  });
});

describe('embedded JSON hydration catalog', () => {
  it('reads initialEvents-style catalogs from __NEXT_DATA__', () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          componentProps: {
            abc: {
              initialEvents: [
                {
                  id: '1',
                  title: 'POWER HOUR SCULPT FUSION',
                  name: 'POWER HOUR SCULPT FUSION',
                  event_start: Date.parse('2026-09-16T21:00:00Z'),
                  venue_name: null,
                  property_name: 'District Hall',
                  url: 'https://example.org/events/power-hour',
                },
                {
                  id: '2',
                  title: 'NIC VANS',
                  name: 'NIC VANS',
                  event_start: Date.parse('2026-09-19T00:00:00Z'),
                  venue_name: 'Mosaic Ultra Lounge',
                  url: 'https://example.org/events/nic-vans',
                },
              ],
            },
          },
        },
      },
    })}</script></html>`;
    const result = extractFromEmbeddedJsonEvents(html, 'https://example.org/events');
    assert.ok(result.events.length >= 2);
    assert.ok(result.events.some((e) => /POWER HOUR/i.test(e.title)));
    assert.ok(result.events.some((e) => /NIC VANS/i.test(e.title) && e.venue === 'Mosaic Ultra Lounge'));
  });
});

describe('surface reconciliation', () => {
  it('does not let past-only JSON-LD overrule upcoming embedded catalog', () => {
    const reconciled = reconcileSurfaceYields({
      now: new Date('2026-09-15T17:00:00Z'),
      surfaces: [
        {
          surfaceId: 'json_ld',
          method: 'json_ld',
          provenanceScore: 6000,
          evidence: [],
          events: [
            {
              externalId: 'past',
              title: 'Old Festival',
              startDate: '2026-09-01',
              startDateTime: null,
              endDate: null,
              endDateTime: null,
              venue: 'Hall',
              address: null,
              city: null,
              regionState: null,
              priceText: null,
              isFree: null,
              eventUrl: 'https://example.org/old',
              ticketOrRsvpUrl: null,
              organizer: null,
              isRecurring: false,
              imageUrl: null,
              sourceUrl: 'https://example.org/events',
              evidence: ['json_ld'],
              method: 'json_ld',
              verificationState: 'verified',
            },
          ],
        },
        {
          surfaceId: 'embedded',
          method: 'embedded_json_events',
          provenanceScore: 8500,
          evidence: [],
          events: [
            {
              externalId: 'new',
              title: 'POWER HOUR SCULPT FUSION',
              startDate: '2026-09-16',
              startDateTime: null,
              endDate: null,
              endDateTime: null,
              venue: 'Hall',
              address: null,
              city: null,
              regionState: null,
              priceText: null,
              isFree: null,
              eventUrl: 'https://example.org/power-hour',
              ticketOrRsvpUrl: null,
              organizer: null,
              isRecurring: false,
              imageUrl: null,
              sourceUrl: 'https://example.org/events',
              evidence: ['embedded'],
              method: 'embedded_json_events',
              verificationState: 'verified',
            },
          ],
        },
      ],
    });
    assert.equal(reconciled.winningSurfaceId, 'embedded');
    assert.equal(reconciled.events.length, 1);
    assert.match(reconciled.events[0]!.title, /POWER HOUR/i);
  });
});

describe('feed pubDate vs event date', () => {
  it('does not treat WordPress syndication pubDate as event start', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
<item>
<title>Andretti Indoor Karting &amp; Games Night</title>
<link>https://example.org/events/andretti/</link>
<pubDate>Mon, 31 Aug 2026 23:19:44 +0000</pubDate>
<description><![CDATA[This page Andretti Indoor Karting &amp; Games Night appeared first on Example.]]></description>
</item>
</channel></rss>`;
    const parsed = extractEventsFromFeedXml({
      xml,
      feedUrl: 'https://example.org/events/feed/',
      sourceUrl: 'https://example.org/events/feed/',
    });
    assert.equal(parsed.events.length, 1);
    assert.equal(parsed.events[0]!.startDate, null);
    assert.ok(parsed.events[0]!.evidence.some((e) => /boilerplate|pubDate_not_event/i.test(e)));
    assert.equal(parsed.events[0]!.title, 'Andretti Indoor Karting & Games Night');
  });
});

describe('source overlap /events vs /events/feed', () => {
  it('marks feed as duplicate_source of collection', () => {
    const overlap = classifyListingSourceOverlap({
      candidateUrl: 'https://example.org/events/feed/',
      authoritativeUrl: 'https://example.org/events/',
      candidateIsFeed: true,
    });
    assert.equal(overlap.disposition, 'duplicate_source');
    assert.equal(listingFeedSiblingOf('https://example.org/events/feed/'), 'https://example.org/events/');
  });
});

describe('HTML entity decode boundary', () => {
  it('decodes &amp; in titles before compare', () => {
    assert.equal(decodeHtmlEntitiesDeterministic('Andretti Indoor Karting &amp; Games'), 'Andretti Indoor Karting & Games');
  });
});

describe('resumable HTML calendar pagination', () => {
  it('advances cursor beyond page 5 when resumeFromPage is set', () => {
    const html = fixture('ssr-date-heading-calendar.fixture.html');
    const planned = planHtmlCalendarPageFetches({
      collectionUrl: 'https://example.org/events/',
      html,
      maxPages: 5,
      resumeFromPage: 5,
    });
    assert.ok(planned.pages.length >= 1);
    const first = Number(planned.pages[0]!.match(/\/page\/(\d+)/)?.[1] ?? 0);
    assert.ok(first === 6 || first === 2, `expected page 6 or wrap to 2, got ${first}`);
  });
});

describe('Instagram title / venue / attribution quality', () => {
  it('scores series edition titles above promo fragments', () => {
    const good = scoreEventTitleLine('OnWax R&B Edition', {
      caption: 'OnWax R&B Edition\nSaturday Sep 19\n8PM',
    });
    const bad = scoreEventTitleLine('Link in bio for tickets', {
      caption: 'Link in bio for tickets',
    });
    assert.ok(good.score > bad.score);
    assert.ok(good.score >= 0.55);
  });

  it('strips time fragments from venue', () => {
    const loc = assessLocationTrust({
      flyerText: 'VYE Lounge Rooftop',
      caption: 'VYE. 8PM.',
      curatorHandle: 'vyelounge',
    });
    assert.ok(loc.venue);
    assert.ok(!/\b8\s*pm\b/i.test(loc.venue!));
  });

  it('attributes configured venue plus collaborators', () => {
    const line = buildAttributionLine('vyelounge', ['theroyalchief', 'onwaxseries']);
    assert.match(line, /@vyelounge/);
    assert.match(line, /@theroyalchief/);
    assert.match(line, /@onwaxseries/);
  });
});
