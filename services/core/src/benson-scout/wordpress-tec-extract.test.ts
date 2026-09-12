import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  stableEventListingFingerprint,
} from './event-listing-extract.js';
import {
  buildTribeEventsCollectionUrl,
  discoverEventSources,
} from './event-source-discovery.js';
import {
  extractFromTribeEventsListHtml,
  extractFromTribeEventsRest,
  htmlHasTribeEventsMonthGrid,
  parseTribeEventsRestJson,
} from './wordpress-tec-extract.js';

const here = dirname(fileURLToPath(import.meta.url));
const showsHtml = readFileSync(join(here, 'fixtures/wordpress-tec-shows-discovery.fixture.html'), 'utf8');
const listHtml = readFileSync(join(here, 'fixtures/wordpress-tec-events-list.fixture.html'), 'utf8');
const monthHtml = readFileSync(join(here, 'fixtures/wordpress-tec-month-grid.fixture.html'), 'utf8');
const restJson = readFileSync(join(here, 'fixtures/wordpress-tec-rest-events.fixture.json'), 'utf8');

describe('WordPress / TEC event-source discovery', () => {
  it('discovers /events/, TEC REST, and iCal from configured /shows/ hub', () => {
    const configured = 'https://musictheaterheritage.com/shows/';
    const discovery = discoverEventSources({ html: showsHtml, pageUrl: configured });
    assert.equal(discovery.configuredUrl, configured);
    assert.ok(discovery.tribeEventsRestUrl?.includes('/wp-json/tribe/events/v1'));
    assert.ok(discovery.icalFeedUrl?.includes('ical=1'));
    assert.equal(discovery.effectiveExtractionUrl, 'https://musictheaterheritage.com/events/');
    assert.ok(discovery.reasons.some((r) => /effective_extraction_url|nav_calendar|shows_hub/i.test(r)));
  });

  it('builds ends_after REST collection URL for currently-running productions', () => {
    const url = buildTribeEventsCollectionUrl('https://musictheaterheritage.com/wp-json/tribe/events/v1/', {
      endsAfter: '2026-09-11 00:00:00',
      perPage: 50,
    });
    assert.match(url, /\/events\?/);
    assert.match(url, /ends_after=2026-09-11/);
    assert.match(url, /per_page=50/);
    assert.match(url, /status=publish/);
  });
});

describe('WordPress / TEC extraction', () => {
  it('detects TEC capability from shows hub without false theater_season takeover', () => {
    const capability = detectEventListingCapability(
      showsHtml,
      'https://musictheaterheritage.com/shows/',
    );
    assert.equal(capability.hasWordpressTecSignals, true);
    assert.equal(capability.hasWordpressEventMarkup, true);
    assert.equal(capability.hasTheaterSeasonSignals, false);
    assert.equal(capability.looksLikeEventListing, true);
    const row = capability.reasons;
    assert.ok(row.some((r) => r.includes('wordpress_tec')));
  });

  it('extracts production runs from TEC REST without inventing curtain times', () => {
    const payload = parseTribeEventsRestJson(restJson);
    assert.ok(payload);
    const events = extractFromTribeEventsRest(payload!, 'https://musictheaterheritage.com/shows/');
    assert.equal(events.length, 3);

    const superstar = events.find((e) => /Jesus Christ Superstar/i.test(e.title));
    assert.ok(superstar);
    assert.equal(superstar!.startDate, '2026-08-20');
    assert.equal(superstar!.endDate, '2026-09-13');
    assert.equal(superstar!.startDateTime, null);
    assert.equal(superstar!.endDateTime, null);
    assert.equal(superstar!.listingRole, 'production');
    assert.ok(superstar!.evidence.includes('granularity:production_run_all_day'));
    assert.ok(superstar!.evidence.includes('performance_time:not_published'));
    assert.ok(superstar!.evidence.includes('multiday_span:single_row'));
    assert.equal(superstar!.venue, 'MTH MainStage');

    const timed = events.find((e) => /Timed Gala/i.test(e.title));
    assert.ok(timed);
    assert.equal(timed!.startDateTime, '2026-10-01T19:30:00');
    assert.equal(timed!.listingRole, 'performance');
  });

  it('pipeline prefers TEC REST payload over JSON-LD page cards', () => {
    const result = extractEventListingsFromHtml({
      html: listHtml,
      pageUrl: 'https://musictheaterheritage.com/events/',
      tecRestPayload: restJson,
    });
    assert.equal(result.method, 'wordpress_tec_rest');
    assert.equal(result.events.length, 3);
    assert.ok(result.events.every((e) => e.method === 'wordpress_tec_rest'));
  });

  it('list HTML yields one row per production (no month-grid expansion)', () => {
    const capability = detectEventListingCapability(
      listHtml,
      'https://musictheaterheritage.com/events/',
    );
    assert.equal(capability.hasTribeEventsListMarkup, true);

    const fromList = extractFromTribeEventsListHtml(
      listHtml,
      'https://musictheaterheritage.com/events/',
    );
    assert.equal(fromList.length, 3);
    assert.equal(new Set(fromList.map((e) => e.eventUrl)).size, 3);

    const superstar = fromList.find((e) => /Jesus Christ Superstar/i.test(e.title));
    assert.ok(superstar);
    assert.equal(superstar!.startDate, '2026-08-20');
    assert.equal(superstar!.endDate, '2026-09-13');
    assert.equal(superstar!.startDateTime, null);

    // Without REST, JSON-LD on the list page may win — still one row per production.
    const result = extractEventListingsFromHtml({
      html: listHtml,
      pageUrl: 'https://musictheaterheritage.com/events/',
    });
    assert.ok(result.events.length >= 3);
    assert.ok(['json_ld', 'wordpress_tec_list'].includes(result.method));
    for (const ev of result.events) {
      assert.equal(ev.startDateTime, null);
    }
  });

  it('refuses month-grid cell duplicates for multi-day productions', () => {
    assert.equal(htmlHasTribeEventsMonthGrid(monthHtml), true);
    const fromMonth = extractFromTribeEventsListHtml(monthHtml, 'https://example.com/events/month/');
    assert.equal(fromMonth.length, 0);

    const result = extractEventListingsFromHtml({
      html: monthHtml,
      pageUrl: 'https://example.com/events/month/',
    });
    assert.equal(result.events.length, 0);
    assert.ok(
      result.rejectionReasons.some((r) =>
        /month_grid_refused|wordpress_tec_list:zero|capability_positive/i.test(r),
      ),
    );
  });

  it('second extraction is idempotent by stable fingerprint', () => {
    const a = extractEventListingsFromHtml({
      html: listHtml,
      pageUrl: 'https://musictheaterheritage.com/events/',
      tecRestPayload: restJson,
    });
    const b = extractEventListingsFromHtml({
      html: listHtml,
      pageUrl: 'https://musictheaterheritage.com/events/',
      tecRestPayload: restJson,
    });
    assert.equal(a.events.length, b.events.length);
    const fpsA = a.events.map(stableEventListingFingerprint).sort();
    const fpsB = b.events.map(stableEventListingFingerprint).sort();
    assert.deepEqual(fpsA, fpsB);
    assert.equal(fpsA.length, new Set(fpsA).size);
  });
});
