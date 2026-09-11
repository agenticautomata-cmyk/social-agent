import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  extractWixEventsHydration,
  urlLooksLikeEventListing,
} from './event-listing-extract.js';
import { inspectSubmittedUrl } from './url-inspect.js';
import { isDirectoryWatchSource, watchlistDisplayHealth, watchlistStatusExplanation } from '../curator-watchlist/watchlist-state.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(join(here, 'fixtures/wix-events-listing.fixture.html'), 'utf8');
const nonEventHtml = readFileSync(join(here, 'fixtures/wix-business-non-event.fixture.html'), 'utf8');
const jsonLdHtml = readFileSync(join(here, 'fixtures/jsonld-events-listing.fixture.html'), 'utf8');

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
      // startDateTime may exist from hydration ISO; price must not be required
      assert.ok(ev.title);
    }
    const recurring = result.events.filter((e) => e.isRecurring);
    assert.ok(recurring.length >= 1);
    // Distinct occurrence slugs/dates must remain separate rows
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
    // Date-only market event stays unresolved clock, not invented time
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
  });
});
