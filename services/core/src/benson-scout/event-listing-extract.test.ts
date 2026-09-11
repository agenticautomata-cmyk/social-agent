import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  extractEventListingsFromIcs,
  extractFromSquarespaceEvents,
  extractWixEventsHydration,
  urlLooksLikeEventListing,
} from './event-listing-extract.js';
import { parseIcsCalendar } from './ics-parse.js';
import { inspectSubmittedUrl } from './url-inspect.js';
import {
  isDirectoryWatchSource,
  watchlistDisplayHealth,
  watchlistStatusExplanation,
} from '../curator-watchlist/watchlist-state.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(join(here, 'fixtures/wix-events-listing.fixture.html'), 'utf8');
const nonEventHtml = readFileSync(join(here, 'fixtures/wix-business-non-event.fixture.html'), 'utf8');
const jsonLdHtml = readFileSync(join(here, 'fixtures/jsonld-events-listing.fixture.html'), 'utf8');
const squarespaceHtml = readFileSync(
  join(here, 'fixtures/squarespace-events-listing.fixture.html'),
  'utf8',
);
const sqIcs = readFileSync(join(here, 'fixtures/squarespace-event.ics'), 'utf8');
const standardsIcs = readFileSync(join(here, 'fixtures/ics-standards.ics'), 'utf8');

describe('Wix / event listing extraction', () => {
  it('classifies live-music-events style URLs as event listings', () => {
    const url = 'https://www.18thandvinelives.com/live-music-events';
    assert.equal(urlLooksLikeEventListing(url), true);
    const inspect = inspectSubmittedUrl(url);
    assert.equal(inspect.sourceType, 'event_directory');
    assert.equal(inspect.extractionMethod, 'event_listing');
    assert.equal(inspect.canonicalUrl, url);
    assert.equal(inspect.loginRequired, false);
  });

  it('fixture yields Wix hydration listings with title/date/venue/url evidence', () => {
    const pageUrl = 'https://fixture-venue.example/live-music-events';
    const capability = detectEventListingCapability(fixtureHtml, pageUrl);
    assert.equal(capability.looksLikeEventListing, true);
    assert.equal(capability.hasWixEventsSignals, true);

    const hydrated = extractWixEventsHydration(fixtureHtml);
    assert.ok(hydrated.length >= 6);

    const result = extractEventListingsFromHtml({ html: fixtureHtml, pageUrl });
    assert.equal(result.method, 'wix_events_hydration');
    assert.ok(result.events.length >= 6);
    assert.equal(result.events.length, new Set(result.events.map((e) => e.eventUrl ?? e.title)).size);

    const lateNight = result.events.find((e) => /Late Night Jam Session/i.test(e.title));
    assert.ok(lateNight);
    assert.equal(lateNight!.startDate, '2026-09-11');
    assert.equal(lateNight!.venue, 'Mutual Musicians Foundation');
    assert.match(lateNight!.eventUrl ?? '', /event-details-registration\/late-night-jam-session/);
    assert.ok(lateNight!.evidence.some((e) => e.startsWith('wix_events_hydration')));
    assert.equal(lateNight!.verificationState, 'verified');

    const wine = result.events.find((e) => /Wine & Jazz Festival/i.test(e.title));
    assert.ok(wine);
    assert.equal(wine!.startDate, '2026-09-12');
    assert.match(wine!.venue ?? '', /Clara Eitmann Messmer Amphitheater/);
  });

  it('allows missing price/time and keeps recurring flags without collapsing', () => {
    const pageUrl = 'https://fixture-venue.example/live-music-events';
    const result = extractEventListingsFromHtml({ html: fixtureHtml, pageUrl });
    for (const ev of result.events) {
      assert.equal(ev.priceText, null);
      assert.ok(ev.title);
    }
    const recurring = result.events.filter((e) => e.isRecurring);
    assert.ok(recurring.length >= 1);
    const late = result.events.filter((e) => /Late Night Jam Session/i.test(e.title));
    assert.equal(late.length, 1);
  });

  it('JSON-LD listing pages extract without Wix adapter', () => {
    const result = extractEventListingsFromHtml({
      html: jsonLdHtml,
      pageUrl: 'https://example.com/events',
    });
    assert.equal(result.method, 'json_ld');
    assert.equal(result.events.length, 2);
    assert.ok(result.events.some((e) => e.title === 'Downtown Jazz Night' && e.startDate === '2026-09-15'));
    const market = result.events.find((e) => e.title === 'Community Market');
    assert.ok(market);
    assert.equal(market!.startDate, '2026-09-20');
    assert.equal(market!.startDateTime, null);
  });

  it('non-event Wix business page is not classified as event listing yield', () => {
    const capability = detectEventListingCapability(
      nonEventHtml,
      'https://fixture-biz.example/about',
    );
    assert.equal(capability.isWixSite, true);
    assert.equal(capability.hasWixEventsSignals, false);
    assert.equal(capability.looksLikeEventListing, false);
    const result = extractEventListingsFromHtml({
      html: nonEventHtml,
      pageUrl: 'https://fixture-biz.example/about',
    });
    assert.equal(result.events.length, 0);
    assert.ok(result.rejectionReasons.includes('page_not_classified_as_event_listing'));
  });

  it('Playwright path is bounded — only used when provided HTML differs', () => {
    const empty = '<html><body><p>loading</p></body></html>';
    const result = extractEventListingsFromHtml({
      html: empty,
      pageUrl: 'https://fixture-venue.example/live-music-events',
      playwrightHtml: fixtureHtml,
    });
    assert.equal(result.method, 'playwright_dom');
    assert.ok(result.events.length >= 6);
    assert.ok(result.strategiesAttempted.includes('playwright_dom'));
  });
});

describe('Squarespace Events + ICS extraction', () => {
  it('detects Squarespace events capability without hostname-only success', () => {
    const capability = detectEventListingCapability(
      squarespaceHtml,
      'https://www.theosc.co/events',
    );
    assert.equal(capability.isSquarespaceSite, true);
    assert.equal(capability.hasSquarespaceEventsSignals, true);
    assert.equal(capability.looksLikeEventListing, true);
    assert.equal(capability.siteTimeZone, 'America/Chicago');
    assert.equal(capability.hasIcsLinks, true);
  });

  it('does not treat generic Squarespace non-event page as events yield', () => {
    const html =
      '<html><head><script>Static.SQUARESPACE_CONTEXT={"website":{"timeZone":"America/Chicago"}};</script></head><body><h1>About</h1></body></html>';
    const capability = detectEventListingCapability(html, 'https://example.squarespace.com/about');
    assert.equal(capability.isSquarespaceSite, true);
    assert.equal(capability.hasSquarespaceEventsSignals, false);
    assert.equal(capability.looksLikeEventListing, false);
  });

  it('fixture extracts upcoming Squarespace events with local overnight times', () => {
    const pageUrl = 'https://www.theosc.co/events';
    const result = extractEventListingsFromHtml({ html: squarespaceHtml, pageUrl });
    assert.equal(result.method, 'squarespace_events');
    assert.ok(result.events.length >= 5);

    const kellz = result.events.find((e) => /Go To Kellz/i.test(e.title));
    assert.ok(kellz);
    assert.equal(kellz!.startDate, '2026-09-11');
    assert.equal(kellz!.startDateTime, '2026-09-11T22:00:00');
    assert.equal(kellz!.endDate, '2026-09-12');
    assert.equal(kellz!.endDateTime, '2026-09-12T02:00:00');
    assert.match(kellz!.eventUrl ?? '', /\/events\/go-to-kellz/);
    assert.ok(kellz!.icsUrl);

    // Past section must not appear in upcoming yield
    assert.equal(result.events.some((e) => /All White Labor Day/i.test(e.title)), false);

    // Multi-month coworking stays one row — no day explosion
    const cowork = result.events.find((e) => /Co-Work Day/i.test(e.title));
    assert.ok(cowork);
    assert.equal(cowork!.startDate, '2026-08-03');
    assert.equal(cowork!.endDate, '2027-01-02');
    assert.equal(result.events.filter((e) => /Co-Work Day/i.test(e.title)).length, 1);

    // Repeated titles remain distinct by occurrence URL/date
    const bible = result.events.filter((e) => /Bible Study/i.test(e.title));
    assert.ok(bible.length >= 2);
    assert.equal(new Set(bible.map((e) => e.eventUrl)).size, bible.length);
  });

  it('ICS UTC projects to America/Chicago without silent date shift when zone provided', () => {
    const parsed = parseIcsCalendar(sqIcs, { preferTimeZone: 'America/Chicago' });
    assert.equal(parsed.events.length, 1);
    assert.equal(parsed.events[0]!.dtstart?.date, '2026-09-11');
    assert.equal(parsed.events[0]!.dtstart?.time?.startsWith('22:00'), true);
    const listings = extractEventListingsFromIcs({
      icsText: sqIcs,
      pageUrl: 'https://www.theosc.co/events',
      preferTimeZone: 'America/Chicago',
    });
    assert.equal(listings[0]!.startDate, '2026-09-11');
    assert.ok(listings[0]!.externalId?.startsWith('ics:'));
  });

  it('standards ICS: all-day, folded lines, escaped text, recurrence-id', () => {
    const parsed = parseIcsCalendar(standardsIcs);
    assert.equal(parsed.events.length, 2);
    const allDay = parsed.events.find((e) => e.uid === 'allday-1@example.com');
    assert.ok(allDay);
    assert.equal(allDay!.dtstart?.allDay, true);
    assert.equal(allDay!.dtstart?.date, '2026-09-20');
    const folded = parsed.events.find((e) => e.uid === 'folded-1@example.com');
    assert.ok(folded);
    assert.match(folded!.summary ?? '', /Folded Title That ContinuesOn Next Line|Folded Title That Continues On Next Line/);
    assert.ok(folded!.description?.includes('Line one'));
    assert.ok(folded!.description?.includes(','));
    assert.ok(folded!.recurrenceId);
  });

  it('per-event ICS enriches Squarespace UID without overriding HTML local date', () => {
    const pageUrl = 'https://www.theosc.co/events';
    const result = extractEventListingsFromHtml({
      html: squarespaceHtml,
      pageUrl,
      icsBodies: [
        {
          url: 'https://www.theosc.co/events/go-to-kellz?format=ical',
          text: sqIcs,
        },
      ],
    });
    assert.equal(result.method, 'squarespace_events');
    const kellz = result.events.find((e) => /Go To Kellz/i.test(e.title));
    assert.ok(kellz);
    assert.equal(kellz!.startDate, '2026-09-11');
    assert.ok(kellz!.externalId?.includes('6a9e2430e6b43a4b032738be@squarespace.com'));
  });

  it('direct extractFromSquarespaceEvents skips past articles', () => {
    const events = extractFromSquarespaceEvents(
      squarespaceHtml,
      'https://www.theosc.co/events',
      'America/Chicago',
    );
    assert.ok(events.every((e) => e.startDate));
    assert.equal(events.some((e) => /Labor Day/i.test(e.title)), false);
  });
});

describe('Event listing Watchlist status / UI semantics', () => {
  const base = {
    enabled: true,
    paused: false,
    sessionStatus: 'none' as string | null,
    authenticationRequired: false,
    lastSuccessfulCheck: null as Date | null,
    lastAttemptedCheck: null as Date | null,
    lastFailureAt: null as Date | null,
  };

  it('200 + zero verified listings is no_yield, never healthy', () => {
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'healthy',
        lastSuccessfulCheck: new Date(),
        lastAttemptedCheck: new Date(),
        lastCheckCompletedOk: true,
        recordsExtracted: 0,
        verifiedYield: 0,
        extractionCapabilityEstablished: false,
        applyYieldGuard: true,
      }),
      'no_yield',
    );
  });

  it('initial successful extraction uses baseline language, not no_change', () => {
    const explanation = watchlistStatusExplanation({
      displayHealth: 'healthy',
      recordsExtracted: 6,
      newRecordsFound: 6,
    });
    assert.match(explanation, /Baseline created from 6 verified event listings/i);
  });

  it('second unchanged check uses no_change listing language', () => {
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'no_change',
        lastSuccessfulCheck: new Date(),
        lastAttemptedCheck: new Date(),
        lastCheckCompletedOk: true,
        recordsExtracted: 6,
        verifiedYield: 6,
        newRecordsFound: 0,
        extractionCapabilityEstablished: true,
        applyYieldGuard: true,
      }),
      'no_change',
    );
    assert.match(
      watchlistStatusExplanation({
        displayHealth: 'no_change',
        recordsExtracted: 6,
        newRecordsFound: 0,
      }),
      /Checked 6 current listings; no changes found/i,
    );
  });

  it('needs_adapter surfaces for recognizable unsupported calendars', () => {
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'needs_adapter',
        lastAttemptedCheck: new Date(),
        lastCheckCompletedOk: true,
        recordsExtracted: 0,
        verifiedYield: 0,
        applyYieldGuard: true,
      }),
      'needs_adapter',
    );
    assert.match(
      watchlistStatusExplanation({ displayHealth: 'needs_adapter' }),
      /Recognizable calendar surface/i,
    );
  });

  it('directory sources use pages metrics and event listing URL classification', () => {
    assert.equal(
      isDirectoryWatchSource({
        platform: 'web',
        adapterType: 'event_listing',
        sourceCategory: 'event_directory',
        sourceUrl: 'https://www.18thandvinelives.com/live-music-events',
        extractionMethod: 'event_listing',
      }),
      true,
    );
    assert.equal(
      isDirectoryWatchSource({
        platform: 'web',
        adapterType: 'event_listing',
        sourceUrl: 'https://www.theosc.co/events',
        extractionMethod: 'squarespace_events',
      }),
      true,
    );
    assert.equal(
      isDirectoryWatchSource({
        platform: 'instagram',
        adapterType: 'social_account',
        sourceUrl: 'https://www.instagram.com/example/',
      }),
      false,
    );
  });

  it('website inspect never requires Instagram session', () => {
    const inspect = inspectSubmittedUrl('https://www.18thandvinelives.com/live-music-events');
    assert.equal(inspect.loginRequired, false);
    assert.equal(inspect.platform, 'web');
    assert.notEqual(inspect.extractionMethod, 'social_session');
    const osc = inspectSubmittedUrl('https://www.theosc.co/events');
    assert.equal(osc.loginRequired, false);
    assert.equal(osc.sourceType, 'event_directory');
  });
});
