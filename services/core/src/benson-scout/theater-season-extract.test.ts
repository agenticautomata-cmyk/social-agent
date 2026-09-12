import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  stableEventListingFingerprint,
  urlLooksLikeEventListing,
} from './event-listing-extract.js';
import {
  extractTheaterSeasonListings,
  groupTheaterSeasonPerformancesForWatchlist,
  looksLikeTheaterSeasonPage,
} from './theater-season-extract.js';
import { discoverEventSources } from './event-source-discovery.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  join(here, 'fixtures/kc-melting-pot-current-season.fixture.html'),
  'utf8',
);
const pageUrl = 'https://kcmeltingpot.com/current-season/';
/** Fixed "now" matching verification day — after Like Six, before Jitney. */
const NOW = new Date('2026-09-11T17:00:00Z');

describe('Theater season / KC Melting Pot current-season', () => {
  it('keeps current-season as effective extraction URL (not Events nav hub)', () => {
    const discovery = discoverEventSources({ html: fixtureHtml, pageUrl });
    assert.equal(discovery.configuredUrl, pageUrl);
    assert.equal(discovery.effectiveExtractionUrl, pageUrl);
    assert.ok(discovery.reasons.includes('configured_url_is_theater_season_page'));
    assert.ok(!/events-programs-outreach/i.test(discovery.effectiveExtractionUrl ?? ''));
  });

  it('classifies current-season URLs as event listings', () => {
    assert.equal(urlLooksLikeEventListing(pageUrl), true);
  });

  it('detects theater-season capability without Event JSON-LD', () => {
    const capability = detectEventListingCapability(fixtureHtml, pageUrl);
    assert.equal(capability.hasTheaterSeasonSignals, true);
    assert.equal(capability.looksLikeEventListing, true);
    assert.equal(capability.hasJsonLdEvents, false);
    assert.equal(capability.siteTimeZone, 'America/Chicago');
    assert.ok(capability.reasons.includes('theater_season_production_sections'));
  });

  it('does not treat hostname alone as theater-season success', () => {
    const about = `<html><body><h1>About KCMPT</h1><p>Donate at theatre.square.site</p></body></html>`;
    assert.equal(looksLikeTheaterSeasonPage(about, 'https://kcmeltingpot.com/about/'), false);
    const result = extractEventListingsFromHtml({
      html: about,
      pageUrl: 'https://kcmeltingpot.com/about/',
      now: NOW,
    });
    assert.equal(result.method, 'none');
    assert.equal(result.events.length, 0);
  });

  it('extracts 4 upcoming production groups / 36 performances and excludes expired', () => {
    const season = extractTheaterSeasonListings({
      html: fixtureHtml,
      pageUrl,
      now: NOW,
    });
    assert.equal(season.expiredPerformanceCount, 11);
    assert.equal(season.productions.length, 4);
    assert.equal(season.performances.length, 36);
    assert.deepEqual(
      season.productions.map((p) => p.productionTitle),
      ['JITNEY', "LIVIN' FAT", 'BLUES FOR AN ALABAMA SKY', 'GOD OF CARNAGE'],
    );
    assert.equal(
      season.productions.every((p) => p.upcomingPerformanceCount === 9),
      true,
    );

    const result = extractEventListingsFromHtml({
      html: fixtureHtml,
      pageUrl,
      now: NOW,
    });
    assert.equal(result.method, 'theater_season');
    assert.equal(result.events.length, 36);
    assert.equal(result.events.filter((e) => e.verificationState === 'verified').length, 36);

    const groups = groupTheaterSeasonPerformancesForWatchlist(result.events);
    assert.equal(groups.length, 4);
    assert.equal(
      groups.reduce((n, g) => n + g.performanceCount, 0),
      36,
    );

    const jitney = result.events.filter((e) => e.productionTitle === 'JITNEY' || e.title === 'JITNEY');
    assert.equal(jitney.length, 9);
    assert.equal(jitney[0]!.startDate, '2026-09-17');
    assert.equal(jitney[0]!.startDateTime, '2026-09-17T10:00:00');
    assert.equal(jitney[1]!.startDateTime, '2026-09-17T19:30:00');
    // Same ticket show URL across performances — must remain distinct.
    const ticketUrls = new Set(jitney.map((e) => e.eventUrl));
    assert.equal(ticketUrls.size, 1);
    const fingerprints = new Set(jitney.map((e) => stableEventListingFingerprint(e)));
    assert.equal(fingerprints.size, 9);
    assert.ok(jitney[0]!.productionId?.startsWith('onthestage:'));

    const blues = result.events.find(
      (e) =>
        (e.productionTitle === 'BLUES FOR AN ALABAMA SKY' || e.title === 'BLUES FOR AN ALABAMA SKY') &&
        e.startDateTime?.includes('T10:00'),
    );
    assert.ok(blues);
    assert.equal(blues!.startDate, '2027-03-11');
    assert.equal(blues!.startDateTime, '2027-03-11T10:00:00');

    assert.equal(result.events.some((e) => /Like Six/i.test(e.title)), false);
    assert.equal(result.events.some((e) => /Like Six/i.test(e.productionTitle ?? '')), false);
  });

  it('second extract pass yields identical fingerprints (no dup identity drift)', () => {
    const first = extractEventListingsFromHtml({ html: fixtureHtml, pageUrl, now: NOW });
    const second = extractEventListingsFromHtml({ html: fixtureHtml, pageUrl, now: NOW });
    assert.equal(first.events.length, second.events.length);
    const a = first.events.map((e) => stableEventListingFingerprint(e)).sort();
    const b = second.events.map((e) => stableEventListingFingerprint(e)).sort();
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, 36);
  });

  it('shared ticket URL alone does not collapse distinct performances in fingerprint', () => {
    const shared =
      'https://onthestage.tickets/show/kc-melting-pot-theatre-productions-inc/6a04f3a83ce95448420cd2f9/';
    const a = stableEventListingFingerprint({
      externalId: null,
      title: 'JITNEY',
      startDate: '2026-09-17',
      startDateTime: '2026-09-17T10:00:00',
      endDate: null,
      endDateTime: null,
      venue: 'KC Melting Pot Theatre',
      address: null,
      city: null,
      regionState: null,
      priceText: null,
      isFree: null,
      eventUrl: shared,
      ticketOrRsvpUrl: shared,
      organizer: null,
      isRecurring: true,
      imageUrl: null,
      sourceUrl: pageUrl,
      evidence: [],
      method: 'theater_season',
      verificationState: 'verified',
    });
    const b = stableEventListingFingerprint({
      externalId: null,
      title: 'JITNEY',
      startDate: '2026-09-17',
      startDateTime: '2026-09-17T19:30:00',
      endDate: null,
      endDateTime: null,
      venue: 'KC Melting Pot Theatre',
      address: null,
      city: null,
      regionState: null,
      priceText: null,
      isFree: null,
      eventUrl: shared,
      ticketOrRsvpUrl: shared,
      organizer: null,
      isRecurring: true,
      imageUrl: null,
      sourceUrl: pageUrl,
      evidence: [],
      method: 'theater_season',
      verificationState: 'verified',
    });
    assert.notEqual(a, b);
  });
});
