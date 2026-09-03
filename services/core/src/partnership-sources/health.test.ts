import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyCheckOutcome,
  explainHealth,
  isHonestNonFailure,
  isSourceWorking,
  nextCheckAt,
} from './health.js';
import { SOURCE_SEEDS, TIER_1_SOURCE_URLS } from './seed.js';

describe('source health classification', () => {
  it('treats an empty KC Restaurant Week participant list as dormant, not broken', () => {
    const state = classifyCheckOutcome({
      fetched: true,
      httpStatus: 200,
      recordCount: 0,
      emptyIsNormal: true,
    });
    assert.equal(state, 'dormant');
    assert.equal(isHonestNonFailure(state), true);
    assert.equal(isSourceWorking(state), true);
    assert.match(
      explainHealth({ state, sourceName: 'KC Restaurant Week — Participants' }),
      /normal state for this source, not a failure/,
    );
  });

  it('treats a robots-disallowed path as a respected refusal, not an error', () => {
    const state = classifyCheckOutcome({
      fetched: false,
      robotsDisallowed: true,
      recordCount: 0,
    });
    assert.equal(state, 'robots_refused');
    assert.equal(isHonestNonFailure(state), true);
    assert.match(
      explainHealth({ state, sourceName: 'HLAKC — News' }),
      /respects that.*not an error/s,
    );
  });

  it('treats a zero-record fetch of a client-rendered page as needs_browser', () => {
    const state = classifyCheckOutcome({
      fetched: true,
      httpStatus: 200,
      recordCount: 0,
      requiresBrowser: true,
    });
    assert.equal(state, 'needs_browser');
    assert.equal(isHonestNonFailure(state), true);
  });

  it('treats a collapsed record count as a structural break, not as no opportunities', () => {
    const state = classifyCheckOutcome({
      fetched: true,
      httpStatus: 200,
      recordCount: 2,
      expectedMinimumRecords: 5,
    });
    assert.equal(state, 'structural_break');
    const explanation = explainHealth({
      state,
      sourceName: 'Visit KC — Hotel Openings & Updates',
    });
    assert.match(explanation, /Benson is not broken/);
    assert.match(explanation, /find the current link/);
  });

  it('treats a 404 as a structural break and a 503 as unreachable', () => {
    assert.equal(
      classifyCheckOutcome({ fetched: true, httpStatus: 404, recordCount: 0 }),
      'structural_break',
    );
    assert.equal(
      classifyCheckOutcome({ fetched: true, httpStatus: 503, recordCount: 0 }),
      'unreachable',
    );
  });

  it('is healthy only when a read actually returned records', () => {
    assert.equal(
      classifyCheckOutcome({ fetched: true, httpStatus: 200, recordCount: 12 }),
      'healthy',
    );
    assert.notEqual(
      classifyCheckOutcome({ fetched: true, httpStatus: 200, recordCount: 0 }),
      'healthy',
    );
  });
});

describe('check scheduling', () => {
  const from = new Date('2026-09-03T05:00:00Z');

  it('schedules weekly sources a week out', () => {
    const next = nextCheckAt({ frequency: 'weekly', health: 'healthy', consecutiveFailures: 0, from });
    assert.equal(Math.round((next.getTime() - from.getTime()) / 86_400_000), 7);
  });

  it('backs off a broken source but never past a month', () => {
    const early = nextCheckAt({
      frequency: 'weekly',
      health: 'unreachable',
      consecutiveFailures: 1,
      from,
    });
    const late = nextCheckAt({
      frequency: 'weekly',
      health: 'unreachable',
      consecutiveFailures: 40,
      from,
    });
    assert.ok(early.getTime() < late.getTime());
    assert.ok(Math.round((late.getTime() - from.getTime()) / 86_400_000) <= 30);
  });

  it('does not keep re-checking a path we have agreed not to fetch', () => {
    const next = nextCheckAt({
      frequency: 'quarterly',
      health: 'robots_refused',
      consecutiveFailures: 0,
      from,
    });
    assert.ok(Math.round((next.getTime() - from.getTime()) / 86_400_000) >= 300);
  });

  it('escalates the Restaurant Week list as the January event approaches', () => {
    const november = new Date('2026-11-20T00:00:00Z');
    const june = new Date('2026-06-01T00:00:00Z');
    const nearEvent = nextCheckAt({
      frequency: 'seasonal_escalating',
      health: 'dormant',
      consecutiveFailures: 0,
      from: november,
    });
    const offSeason = nextCheckAt({
      frequency: 'seasonal_escalating',
      health: 'dormant',
      consecutiveFailures: 0,
      from: june,
    });
    assert.equal(Math.round((nearEvent.getTime() - november.getTime()) / 86_400_000), 1);
    assert.equal(Math.round((offSeason.getTime() - june.getTime()) / 86_400_000), 30);
  });
});

describe('source seed integrity', () => {
  it('seeds the six verified Tier 1 sources', () => {
    assert.equal(TIER_1_SOURCE_URLS.length, 6);
    assert.ok(TIER_1_SOURCE_URLS.includes('https://crossroadshotelkc.com/contact-2/'));
    assert.ok(TIER_1_SOURCE_URLS.includes('https://www.loewshotels.com/influencer-stay-request'));
  });

  it('has no duplicate URLs', () => {
    const urls = SOURCE_SEEDS.map((s) => s.url);
    assert.equal(new Set(urls).size, urls.length);
  });

  it('excludes Four Seasons from being presented as a Kansas City option', () => {
    const fourSeasons = SOURCE_SEEDS.find((s) => s.url.includes('fourseasons'));
    assert.ok(fourSeasons, 'Four Seasons should be recorded so it cannot be re-added by accident');
    assert.equal(fourSeasons.enabled, false);
    assert.equal(fourSeasons.geographicRelevance, 'national_no_kc_property');
  });

  it('records the robots-disallowed HLAKC news path as disallowed and disabled', () => {
    const disallowed = SOURCE_SEEDS.find((s) => s.url.endsWith('/news.html'));
    assert.ok(disallowed);
    assert.equal(disallowed.robotsStatus, 'disallowed');
    assert.equal(disallowed.enabled, false);
  });

  it('models Hilton as a router rather than a decision-maker', () => {
    const hilton = SOURCE_SEEDS.find((s) => s.url.includes('influencer-inquiries'));
    assert.ok(hilton);
    assert.match(hilton.extractionTarget, /router/i);
    assert.match(hilton.notes, /never as a decision-maker/i);
  });

  it('never alerts on silence for the sources documented as normally quiet', () => {
    const newsroom = SOURCE_SEEDS.find((s) => s.url === 'https://news.visitkc.com/');
    assert.ok(newsroom);
    assert.equal(newsroom.alertOnSilence, false);
    const restaurantWeek = SOURCE_SEEDS.find((s) => s.url.includes('kcrestaurantweek'));
    assert.equal(restaurantWeek?.alertOnSilence, false);
  });

  it('keeps source-specific lead times attached to their own source', () => {
    const kansas = SOURCE_SEEDS.find((s) => s.url.includes('travelks.com'));
    const visitKc = SOURCE_SEEDS.find((s) => s.url.includes('visitkc.com/media-center/contact-us'));
    assert.equal(kansas?.leadTimeDays, 60);
    assert.equal(visitKc?.leadTimeDays, 14);
    // A source with no published lead time must not inherit one.
    const crossroads = SOURCE_SEEDS.find((s) => s.url === 'https://crossroadshotelkc.com/events/');
    assert.equal(crossroads?.leadTimeDays, null);
  });

  it('honors the Visit KC published crawl delay on that domain only', () => {
    const visitKc = SOURCE_SEEDS.filter((s) => s.url.includes('visitkc.com'));
    assert.ok(visitKc.length >= 2);
    for (const source of visitKc) assert.equal(source.crawlDelaySeconds, 5);
    const crossroads = SOURCE_SEEDS.find((s) => s.url === 'https://crossroadshotelkc.com/events/');
    assert.equal(crossroads?.crawlDelaySeconds, null);
  });

  it('marks the client-rendered sources as needing a browser', () => {
    const directory = SOURCE_SEEDS.find((s) => s.url.includes('web.kansascitylodging.org'));
    assert.equal(directory?.requiresPlaywright, true);
    const crossroads = SOURCE_SEEDS.find((s) => s.url === 'https://crossroadshotelkc.com/events/');
    assert.equal(crossroads?.requiresPlaywright, false);
  });

  it('flags Origin Hotel as monitor-only because it publishes no media contact', () => {
    const origin = SOURCE_SEEDS.find((s) => s.url.includes('originhotel.com'));
    assert.ok(origin);
    assert.match(origin.notes, /monitor-only/);
    assert.match(origin.notes, /never become send-ready/);
  });
});
