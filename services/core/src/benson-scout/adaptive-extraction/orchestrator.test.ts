/**
 * Adaptive website extraction — fixture-driven unfamiliar-site scenarios.
 * No production domain hard-coding; Funny Bone is not referenced here.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  diagnoseAcquisition,
  extractRhpEventListings,
  recognizePlatforms,
  runAdaptiveExtractionFromArtifacts,
  validateExtractedEvents,
} from './index.js';
import { detectEventListingCapability, extractEventListingsFromHtml } from '../event-listing-extract.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function load(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('adaptive acquisition diagnosis', () => {
  it('records HTTP 403 challenge without treating it as extraction success', () => {
    const html = load('http-403-datadome-challenge.fixture.html');
    const obs = diagnoseAcquisition({
      configuredUrl: 'https://events.example-comedy-club.test/shows/',
      status: 403,
      html,
      headers: { 'x-datadome': 'protected', server: 'cloudflare' },
    });
    assert.equal(obs.http403, true);
    assert.equal(obs.kind, 'challenge');
    assert.equal(obs.challengeProvider, 'datadome');
    assert.equal(obs.usefulEventContentLikely, false);
  });

  it('recognizes useful SSR HTML separately from status code', () => {
    const html = load('http-200-jsonld-ssr.fixture.html');
    const obs = diagnoseAcquisition({
      configuredUrl: 'https://venue.example.test/events/',
      status: 200,
      html,
    });
    assert.ok(obs.kind === 'useful_html' || obs.kind === 'structured_payload');
    assert.equal(obs.usefulEventContentLikely, true);
  });
});

describe('adaptive platform recognition', () => {
  it('keys RHP from sitemap CPT signature, not domain', () => {
    const sitemap = load('rhp-sitemap-index.fixture.xml');
    const platforms = recognizePlatforms({
      html: '',
      pageUrl: 'https://events.example-comedy-club.test/shows/',
      sitemapXml: sitemap,
      acquisitionKind: 'challenge',
    });
    assert.equal(platforms[0]?.signature, 'wordpress_rhp_events');
    assert.match(platforms[0]!.profileKey, /rhp_events/);
  });

  it('keys RHP from HTML plugin markers', () => {
    const html = load('rhp-events-listing.fixture.html');
    const platforms = recognizePlatforms({
      html,
      pageUrl: 'https://events.example-comedy-club.test/shows/',
    });
    assert.equal(platforms[0]?.signature, 'wordpress_rhp_events');
    assert.equal(detectEventListingCapability(html).hasWordpressRhpEventsSignals, true);
  });
});

describe('RHP events extraction', () => {
  it('extracts listing cards with times, prices, and ages', () => {
    const html = load('rhp-events-listing.fixture.html');
    const result = extractRhpEventListings({
      html,
      pageUrl: 'https://events.example-comedy-club.test/shows/',
      now: new Date('2026-09-13T12:00:00-05:00'),
    });
    assert.ok(result.events.length >= 2);
    assert.ok(result.events.some((e) => e.title.includes('Jordan Avery')));
    assert.ok(result.events.some((e) => e.priceText && /\$/.test(e.priceText)));
    assert.ok(result.events.some((e) => e.ageRestriction && /21|18/.test(e.ageRestriction)));
    assert.equal(result.method, 'wordpress_rhp_events');
  });

  it('separates multi-performance engagement showtimes and doors', () => {
    const html = load('rhp-events-multi-performance.fixture.html');
    const result = extractRhpEventListings({
      html,
      pageUrl: 'https://events.example-comedy-club.test/event/alex-rivera/example-comedy-club/',
      now: new Date('2026-09-13T12:00:00-05:00'),
    });
    assert.equal(result.events.length, 4);
    const times = new Set(result.events.map((e) => e.startTimeLocal).filter(Boolean));
    assert.ok(times.size >= 3);
    assert.ok(result.events.every((e) => e.productionGroupKey));
    assert.ok(result.events.some((e) => e.description && /Doors/i.test(e.description)));
    assert.ok(result.events.some((e) => e.ticketUrl));
  });
});

describe('adaptive orchestrator fixtures', () => {
  it('HTTP 200 SSR JSON-LD selects schema path without domain hard-coding', () => {
    const html = load('http-200-jsonld-ssr.fixture.html');
    const result = runAdaptiveExtractionFromArtifacts({
      configuredUrl: 'https://venue.example.test/events/',
      httpStatus: 200,
      html,
      now: new Date('2026-09-13T12:00:00-05:00'),
    });
    assert.ok(result.occurrenceCount >= 2);
    assert.ok(['healthy', 'no_change', 'partial'].includes(result.status));
    assert.ok(
      result.selectedMethod === 'json_ld' ||
        result.platforms.some((p) => p.signature === 'schema_org_events'),
    );
  });

  it('HTTP 403 + successful browser HTML yields RHP events (not failed-on-403)', () => {
    const challenge = load('http-403-datadome-challenge.fixture.html');
    const browserHtml = load('rhp-events-listing.fixture.html');
    const sitemap = `${load('rhp-sitemap-index.fixture.xml')}\n${load('rhp-events-sitemap.fixture.xml')}`;
    const result = runAdaptiveExtractionFromArtifacts({
      configuredUrl: 'https://events.example-comedy-club.test/shows/',
      httpStatus: 403,
      html: challenge,
      sitemapXml: sitemap,
      browserHtml,
      browserBlocked: false,
      now: new Date('2026-09-13T12:00:00-05:00'),
    });
    assert.equal(result.acquisition.http403, true);
    assert.notEqual(result.status, 'failed');
    assert.ok(result.occurrenceCount >= 2);
    assert.equal(result.selectedPlatform?.signature, 'wordpress_rhp_events');
    assert.equal(result.fallbackResult, 'browser_html_ok');
    assert.ok(['healthy', 'no_change', 'partial'].includes(result.status));
  });

  it('HTTP 403 + browser also challenged → blocked with evidence', () => {
    const challenge = load('http-403-datadome-challenge.fixture.html');
    const sitemap = load('rhp-sitemap-index.fixture.xml');
    const result = runAdaptiveExtractionFromArtifacts({
      configuredUrl: 'https://events.example-comedy-club.test/shows/',
      httpStatus: 403,
      html: challenge,
      sitemapXml: sitemap,
      browserHtml: challenge,
      browserBlocked: true,
      browserChallengeProvider: 'datadome',
      browserReason: 'browser_blocked:datadome',
      now: new Date('2026-09-13T12:00:00-05:00'),
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.acquisition.http403, true);
    assert.equal(result.selectedPlatform?.signature, 'wordpress_rhp_events');
    assert.match(result.fallbackResult ?? '', /blocked/);
    assert.ok(result.failedStage === 'browser_fallback' || result.failureReason);
  });

  it('JS shell hydration is diagnosed and can fall through adapters', () => {
    const html = load('http-200-js-shell-hydration.fixture.html');
    const obs = diagnoseAcquisition({
      configuredUrl: 'https://shell.example.test/events/',
      status: 200,
      html,
    });
    assert.ok(obs.kind === 'js_shell' || obs.kind === 'structured_payload' || obs.kind === 'useful_html');
    const platforms = recognizePlatforms({
      html,
      pageUrl: 'https://shell.example.test/events/',
      acquisitionKind: obs.kind,
    });
    assert.ok(platforms.some((p) => p.signature === 'js_hydration_shell' || p.signature === 'unknown'));
  });

  it('idempotent second validation keeps fingerprint stable', () => {
    const html = load('rhp-events-multi-performance.fixture.html');
    const first = runAdaptiveExtractionFromArtifacts({
      configuredUrl: 'https://events.example-comedy-club.test/event/alex-rivera/example-comedy-club/',
      httpStatus: 200,
      html,
      now: new Date('2026-09-13T12:00:00-05:00'),
    });
    const second = runAdaptiveExtractionFromArtifacts({
      configuredUrl: 'https://events.example-comedy-club.test/event/alex-rivera/example-comedy-club/',
      httpStatus: 200,
      html,
      priorConfig: {
        adaptiveContentFingerprint: first.profile?.pageStructureFingerprint,
        recordsExtracted: first.occurrenceCount,
        adaptiveStrategyProfile: first.profile ?? undefined,
      },
      now: new Date('2026-09-13T12:05:00-05:00'),
    });
    assert.equal(first.occurrenceCount, second.occurrenceCount);
    assert.equal(second.status, 'no_change');
  });

  it('validation quarantines nav noise and does not invent fields', () => {
    const v = validateExtractedEvents({
      events: [
        {
          externalId: 'x',
          title: 'Buy Tickets',
          startDate: '2026-10-01',
          startDateTime: null,
          endDate: null,
          endDateTime: null,
          venue: null,
          address: null,
          city: null,
          regionState: null,
          priceText: null,
          isFree: null,
          eventUrl: null,
          ticketOrRsvpUrl: null,
          organizer: null,
          isRecurring: false,
          imageUrl: null,
          sourceUrl: 'https://example.test/',
          evidence: [],
          method: 'semantic_html_blocks',
          verificationState: 'partial',
        },
      ],
      now: new Date('2026-09-13T12:00:00-05:00'),
    });
    assert.equal(v.accepted.length, 0);
    assert.equal(v.quarantined.length, 1);
  });
});

describe('adapter regressions still reachable via extractEventListingsFromHtml', () => {
  it('RHP listing is selected through shared extract waterfall', () => {
    const html = load('rhp-events-listing.fixture.html');
    const result = extractEventListingsFromHtml({
      html,
      pageUrl: 'https://events.example-comedy-club.test/shows/',
      now: new Date('2026-09-13T12:00:00-05:00'),
    });
    assert.equal(result.method, 'wordpress_rhp_events');
    assert.ok(result.events.length >= 2);
  });

  it('JSON-LD fixture still extracts via shared waterfall', () => {
    const html = load('http-200-jsonld-ssr.fixture.html');
    const result = extractEventListingsFromHtml({
      html,
      pageUrl: 'https://venue.example.test/events/',
    });
    assert.equal(result.method, 'json_ld');
    assert.ok(result.events.length >= 2);
  });
});
