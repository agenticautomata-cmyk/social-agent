import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  extractWixEventsHydration,
  htmlLooksLikeIncompleteWixEventRender,
  stableEventListingFingerprint,
  urlLooksLikeEventListing,
} from './event-listing-extract.js';
import { inspectSubmittedUrl } from './url-inspect.js';
import {
  extractPublicRestrictions,
  extractWixEventListings,
  mergeCompanionSoldOut,
  splitWixThemeTitle,
} from './wix-events-extract.js';
import { stripTrackingParams, isUpcomingLocalDate } from './event-listing-outcomes.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

const vineHtml = fx('wix-events-listing.fixture.html');
const flHtml = fx('wix-fantasy-lounge-event-list.fixture.html');
const companionsHtml = fx('wix-ticket-rsvp-companions.fixture.html');
const unrelatedHtml = fx('wix-same-night-unrelated.fixture.html');
const repeatedHtml = fx('wix-repeated-hydration.fixture.html');
const browserHtml = fx('wix-browser-rendered-cards.fixture.html');
const incompleteHtml = fx('wix-incomplete-render.fixture.html');
const emptyHtml = fx('wix-no-upcoming.fixture.html');
const expiredHtml = fx('wix-expired-events.fixture.html');
const midnightHtml = fx('wix-midnight-crossing.fixture.html');
const trackingHtml = fx('wix-tracking-params.fixture.html');
const restrictionsHtml = fx('wix-membership-vetting-age.fixture.html');
const listCalHtml = fx('wix-list-and-calendar-same-event.fixture.html');

describe('Wix multi-variant Fantasy Lounge extraction', () => {
  it('1. existing 18th & Vine hydration fixture still yields dated listings', () => {
    const pageUrl = 'https://fixture-venue.example/live-music-events';
    const result = extractEventListingsFromHtml({ html: vineHtml, pageUrl });
    assert.equal(result.method, 'wix_events_hydration');
    assert.ok(result.events.length >= 6);
    assert.ok(result.events.every((e) => e.eventUrl?.includes('event-details-registration/')));
  });

  it('2. Fantasy Lounge event-list format routes and extracts grouped nights', () => {
    const pageUrl = 'https://www.thefantasylounge.com/event-list';
    assert.equal(urlLooksLikeEventListing(pageUrl), true);
    assert.equal(inspectSubmittedUrl(pageUrl).extractionMethod, 'event_listing');
    const result = extractEventListingsFromHtml({ html: flHtml, pageUrl });
    assert.equal(result.method, 'wix_events_hydration');
    assert.ok(result.diagnostics?.candidatesDetected === 16);
    assert.equal(result.diagnostics?.companionPairsLinked, 8);
    assert.equal(result.events.length, 8);
    assert.ok(result.events.every((e) => e.eventUrl?.includes('/event-details/')));
    assert.ok(result.events.every((e) => e.ticketUrl && e.rsvpUrl));
    assert.ok(result.events.every((e) => e.soldOut === false));
  });

  it('3. ticket/RSVP companions group with themed primary title and both provenance IDs', () => {
    const pageUrl = 'https://fixture-lounge.example/event-list';
    const result = extractEventListingsFromHtml({ html: companionsHtml, pageUrl });
    assert.equal(result.events.length, 2);
    assert.equal(result.diagnostics?.companionPairsLinked, 2);
    for (const night of result.events) {
      assert.match(night.title, /Theme:/i);
      assert.ok(night.ticketUrl);
      assert.ok(night.rsvpUrl);
      assert.equal(night.companionExternalIds?.length, 2);
      assert.ok(night.companionGroupKey);
      assert.equal(night.membersOnly, true);
      assert.equal(night.vettedGuests, true);
      // Ticket companions are available even when themed RSVP cards are soldOut.
      assert.equal(night.soldOut, false);
    }
  });

  it('3b. companion soldOut prefers ticket inventory / all-known-sold-out rule', () => {
    assert.equal(
      mergeCompanionSoldOut([
        { actionType: 'ticket', soldOut: false },
        { actionType: 'rsvp', soldOut: true },
      ]),
      false,
    );
    assert.equal(
      mergeCompanionSoldOut([
        { actionType: 'ticket', soldOut: true },
        { actionType: 'rsvp', soldOut: true },
      ]),
      true,
    );
    assert.equal(
      mergeCompanionSoldOut([
        { actionType: 'ticket', soldOut: true },
        { actionType: 'rsvp', soldOut: false },
      ]),
      true,
    );
    assert.equal(
      mergeCompanionSoldOut([
        { actionType: 'rsvp', soldOut: true },
        { actionType: 'register', soldOut: false },
      ]),
      false,
    );
    assert.equal(
      mergeCompanionSoldOut([
        { actionType: 'rsvp', soldOut: true },
        { actionType: 'register', soldOut: true },
      ]),
      true,
    );
    assert.equal(mergeCompanionSoldOut([{ actionType: 'unknown', soldOut: null }]), null);
  });

  it('4. same-night unrelated events must not merge', () => {
    const pageUrl = 'https://fixture-lounge.example/event-list';
    const result = extractEventListingsFromHtml({ html: unrelatedHtml, pageUrl });
    assert.equal(result.events.length, 2);
    assert.equal(result.diagnostics?.companionPairsLinked ?? 0, 0);
    const titles = result.events.map((e) => e.title).sort();
    assert.deepEqual(titles, ['Alpha Night Social', 'Beta Jazz Showcase']);
  });

  it('5. repeated Wix hydration objects are deduped', () => {
    const pageUrl = 'https://fixture-lounge.example/event-list';
    const hydrated = extractWixEventsHydration(repeatedHtml);
    assert.ok(hydrated.length >= 2);
    const result = extractEventListingsFromHtml({ html: repeatedHtml, pageUrl });
    assert.equal(result.events.length, 1);
    assert.ok((result.diagnostics?.duplicatesSuppressed ?? 0) >= 1);
  });

  it('6. browser-rendered Wix cards extract without hydration payload', () => {
    const pageUrl = 'https://fixture-lounge.example/event-list';
    const result = extractEventListingsFromHtml({
      html: '<html></html>',
      pageUrl,
      playwrightHtml: browserHtml,
    });
    assert.equal(result.method, 'playwright_dom');
    assert.ok(result.events.length >= 1);
    assert.match(result.events[0]!.title, /Night One Social/i);
  });

  it('7. incomplete Wix rendering is flagged, not silent no_yield', () => {
    assert.equal(htmlLooksLikeIncompleteWixEventRender(incompleteHtml), true);
    const result = extractEventListingsFromHtml({
      html: incompleteHtml,
      pageUrl: 'https://fixture-lounge.example/event-list',
    });
    assert.equal(result.events.length, 0);
    assert.equal(result.diagnostics?.incompleteRender, true);
    assert.ok(result.rejectionReasons.some((r) => r.startsWith('incomplete_render')));
  });

  it('8. Wix page with no upcoming events is supported empty, not incomplete', () => {
    const result = extractWixEventListings(emptyHtml, 'https://fixture-lounge.example/event-list');
    assert.equal(result.events.length, 0);
    assert.equal(result.diagnostics.incompleteRender, false);
    assert.equal(result.diagnostics.renderingComplete, true);
  });

  it('9. expired Wix events extract with past local dates', () => {
    const result = extractEventListingsFromHtml({
      html: expiredHtml,
      pageUrl: 'https://fixture-lounge.example/event-list',
    });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]!.startDate, '2026-08-01');
    assert.equal(isUpcomingLocalDate('2026-08-01', new Date('2026-09-12T12:00:00Z')), false);
  });

  it('10. midnight-crossing events keep America/Chicago wall date', () => {
    const result = extractEventListingsFromHtml({
      html: midnightHtml,
      pageUrl: 'https://fixture-lounge.example/event-list',
    });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]!.startDate, '2026-09-12');
    assert.equal(result.events[0]!.startTimeLocal, '9:00 PM');
    assert.equal(result.events[0]!.endDate, '2026-09-13');
  });

  it('11. America/Chicago date preservation prefers startDateFormatted', () => {
    const result = extractEventListingsFromHtml({
      html: midnightHtml,
      pageUrl: 'https://fixture-lounge.example/event-list',
    });
    // UTC instant is 2026-09-13T02:00Z — wall date must remain Sep 12.
    assert.notEqual(result.events[0]!.startDate, '2026-09-13');
    assert.equal(result.events[0]!.startDate, '2026-09-12');
  });

  it('12. repeat-run idempotency uses stable companion group fingerprints', () => {
    const pageUrl = 'https://fixture-lounge.example/event-list';
    const first = extractEventListingsFromHtml({ html: companionsHtml, pageUrl });
    const second = extractEventListingsFromHtml({ html: companionsHtml, pageUrl });
    assert.equal(first.events.length, second.events.length);
    const fps1 = first.events.map(stableEventListingFingerprint).sort();
    const fps2 = second.events.map(stableEventListingFingerprint).sort();
    assert.deepEqual(fps1, fps2);
    assert.equal(new Set(fps1).size, fps1.length);
  });

  it('13. tracking parameters are stripped from action URLs', () => {
    const cleaned = stripTrackingParams(
      'https://fixture-lounge.example/event-details/x?utm_source=x&fbclid=abc&keep=1',
    );
    assert.match(cleaned, /keep=1/);
    assert.doesNotMatch(cleaned, /utm_source|fbclid/);
    const result = extractEventListingsFromHtml({
      html: trackingHtml,
      pageUrl: 'https://fixture-lounge.example/event-list',
    });
    assert.ok(result.events.length >= 1);
    for (const ev of result.events) {
      for (const url of [ev.eventUrl, ev.ticketUrl, ev.rsvpUrl]) {
        if (!url) continue;
        assert.doesNotMatch(url, /utm_|fbclid/);
      }
    }
  });

  it('14. membership, vetting and age restrictions are retained when public', () => {
    const parsed = extractPublicRestrictions(
      'Members Only Ticket Access. Vetted guests. 21+ only.',
    );
    assert.equal(parsed.membersOnly, true);
    assert.equal(parsed.vettedGuests, true);
    assert.equal(parsed.ageRestriction, '21+');
    const result = extractEventListingsFromHtml({
      html: restrictionsHtml,
      pageUrl: 'https://fixture-lounge.example/event-list',
    });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]!.membersOnly, true);
    assert.equal(result.events[0]!.vettedGuests, true);
    assert.equal(result.events[0]!.ageRestriction, '21+');
    assert.equal(result.events[0]!.soldOut, true);
  });

  it('15. list and calendar views with the same provider event do not duplicate nights', () => {
    const pageUrl = 'https://fixture-lounge.example/event-list';
    const hydrated = extractWixEventsHydration(listCalHtml);
    assert.ok(hydrated.length >= 2);
    const result = extractEventListingsFromHtml({ html: listCalHtml, pageUrl });
    assert.equal(result.events.length, 1);
  });

  it('theme splitter and capability markers stay hostname-agnostic', () => {
    const split = splitWixThemeTitle('Saturday Night Event-September 12-Theme:All White Energy');
    assert.equal(split.theme, 'All White Energy');
    assert.match(split.baseTitle, /Saturday Night Event-September 12/i);
    const cap = detectEventListingCapability(flHtml, 'https://example.com/event-list');
    assert.equal(cap.hasWixEventsSignals, true);
    assert.equal(cap.isWixSite, true);
  });
});
