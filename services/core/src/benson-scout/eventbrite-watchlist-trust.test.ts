import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventbriteListingRedirectedToHomepage,
  normalizeWatchlistUrl,
} from './watchlist-url.js';
import { inspectSubmittedUrl } from './url-inspect.js';
import { canonicalizeWatchSource } from './canonical-source.js';
import { watchlistDisplayHealth } from '../curator-watchlist/watchlist-state.js';

describe('Eventbrite Watchlist URL trust', () => {
  it('strips Facebook tracking from homepage and marks needs_setup', () => {
    const normalized = normalizeWatchlistUrl(
      'https://www.eventbrite.com/?fbclid=IwAR0example&utm_source=facebook',
    );
    assert.equal(normalized.configuredUrl, 'https://www.eventbrite.com/');
    assert.equal(normalized.needsSetup, true);
    assert.match(normalized.setupReason ?? '', /location-specific/i);

    const inspect = inspectSubmittedUrl(
      'https://www.eventbrite.com/?fbclid=IwAR0example&utm_source=facebook',
    );
    assert.equal(inspect.canonicalUrl, 'https://www.eventbrite.com/');
    assert.equal(inspect.needsSetup, true);
    assert.equal(inspect.extractionMethod, 'eventbrite_directory');
  });

  it('preserves Kansas City listing path and does not collapse to domain root', () => {
    const url = 'https://www.eventbrite.com/d/mo--kansas-city/events/';
    const normalized = normalizeWatchlistUrl(url);
    assert.equal(normalized.configuredUrl, url);
    assert.equal(normalized.needsSetup, false);
    assert.ok(normalized.pathname.includes('mo--kansas-city'));

    const inspect = inspectSubmittedUrl(`${url}?utm_campaign=test&fbclid=abc`);
    assert.equal(inspect.canonicalUrl, url);
    assert.equal(inspect.needsSetup, false);
    assert.notEqual(inspect.canonicalUrl, 'https://www.eventbrite.com');
    assert.notEqual(inspect.canonicalUrl, 'https://www.eventbrite.com/');
  });

  it('never treats a redirect target as the configured URL identity', () => {
    const configured = 'https://www.eventbrite.com/d/mo--kansas-city/events/';
    const homepage = 'https://www.eventbrite.com/';
    assert.equal(eventbriteListingRedirectedToHomepage(configured, homepage), true);
    assert.equal(
      eventbriteListingRedirectedToHomepage(configured, configured),
      false,
    );
    const canonicalConfigured = canonicalizeWatchSource(configured);
    const canonicalHome = canonicalizeWatchSource(homepage);
    assert.notEqual(canonicalConfigured.key, canonicalHome.key);
    assert.equal(canonicalConfigured.canonicalUrl, configured);
  });

  it('dedupes on intentional Eventbrite listing key, not hostname alone', () => {
    const kc = canonicalizeWatchSource('https://www.eventbrite.com/d/mo--kansas-city/events/');
    const food = canonicalizeWatchSource(
      'https://www.eventbrite.com/d/mo--kansas-city/food-and-drink--events/',
    );
    const home = canonicalizeWatchSource('https://www.eventbrite.com/');
    assert.match(kc.key, /^eventbrite:listing:/);
    assert.notEqual(kc.key, food.key);
    assert.notEqual(kc.key, home.key);
  });
});

describe('Watchlist display health — yield vs reachability', () => {
  const base = {
    enabled: true,
    paused: false,
    sessionStatus: 'none' as string | null,
    authenticationRequired: false,
    lastSuccessfulCheck: null as Date | null,
    lastAttemptedCheck: null as Date | null,
    lastFailureAt: null as Date | null,
  };

  it('200 with zero extracted records is not healthy', () => {
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
      }),
      'no_yield',
    );
  });

  it('valid check with extracted verified events can become healthy', () => {
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'healthy',
        lastSuccessfulCheck: new Date(),
        lastAttemptedCheck: new Date(),
        recordsExtracted: 18,
        verifiedYield: 18,
        newRecordsFound: 6,
        extractionCapabilityEstablished: true,
        lastCheckCompletedOk: true,
      }),
      'healthy',
    );
  });

  it('no_change only after extraction capability established', () => {
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'no_change',
        lastSuccessfulCheck: new Date(),
        lastAttemptedCheck: new Date(),
        recordsExtracted: 0,
        newRecordsFound: 0,
        extractionCapabilityEstablished: true,
        lastCheckCompletedOk: true,
      }),
      'no_change',
    );
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'no_yield',
        lastSuccessfulCheck: new Date(),
        lastAttemptedCheck: new Date(),
        recordsExtracted: 0,
        extractionCapabilityEstablished: false,
        lastCheckCompletedOk: true,
      }),
      'no_yield',
    );
  });

  it('blocked/redirected Eventbrite responses get blocked state', () => {
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'blocked',
        reachability: 'redirected',
        lastAttemptedCheck: new Date(),
      }),
      'blocked',
    );
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'pending',
        reachability: 'blocked',
        lastAttemptedCheck: new Date(),
      }),
      'blocked',
    );
  });

  it('needs_setup for homepage Eventbrite', () => {
    assert.equal(
      watchlistDisplayHealth({
        ...base,
        healthStatus: 'needs_setup',
        needsSetup: true,
        paused: true,
      }),
      'needs_setup',
    );
  });
});
