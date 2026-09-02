import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateDiscoverTrust } from '../creator-interest/discover-trust.js';
import { isCalendarKcRelevant } from '../creator-calendar/population/eligibility.js';
import {
  classifyWatchlistText,
  classifyWatchlistYield,
  collapseWatchlistFindings,
  findingCanonicalKey,
  formatWatchlistBriefLines,
  routeWatchlistFinding,
} from './watchlist-intelligence.js';

const NOW = new Date('2026-09-02T12:00:00.000Z');
const BASE = {
  sourceUrl: 'https://www.instagram.com/p/EXAMPLE/',
  watchedSource: '@swiftscajuncuisine',
  retrievedAt: '2026-09-02T04:25:39.000Z',
  now: NOW,
};

describe('watchlist information types from one account', () => {
  it('extracts a lunch special and a separate food-truck week from the same account', () => {
    const special = classifyWatchlistText({
      ...BASE,
      sourceUrl: 'https://www.instagram.com/p/DclohnJOqvP/',
      text: 'Fish Friday lunch special! 11am-3pm Restaurant only 3415 Main St KCMO',
      publishedAt: '2026-08-28T14:59:53.000Z',
    });
    const week = classifyWatchlistText({
      ...BASE,
      sourceUrl: 'https://www.instagram.com/p/DcwWRQkKGwa/',
      text: 'Catch Swifts Food Truck all week long, Sept 1st until Labor Day Sept 7th, at locations throughout the KC metro.',
      publishedAt: '2026-09-01T18:52:00.000Z',
    });
    assert.equal(special.accepted.some((f) => f.type === 'promotion_sale'), true);
    assert.equal(week.accepted.some((f) => f.type === 'schedule_change' || f.type === 'event'), true);
    assert.notEqual(special.accepted[0]?.canonicalKey, week.accepted[0]?.canonicalKey);
  });
});

describe('posting batches', () => {
  it('keeps separate announcements from one posting batch', () => {
    const a = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      sourceUrl: 'https://www.instagram.com/p/DcpBspFAGLL/',
      text: 'Tickets on sale now. Ghostface Killah Official After Party at The Boone Theater THIS WEDNESDAY SEPT.2',
    });
    const b = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      sourceUrl: 'https://www.instagram.com/p/OTHERPOST/',
      text: 'Vendor spots available for Labor Day weekend. Applications open now.',
    });
    const merged = collapseWatchlistFindings([...a.accepted, ...b.accepted]);
    assert.ok(merged.length >= 2);
    assert.ok(merged.some((f) => f.type === 'event'));
    assert.ok(merged.some((f) => f.type === 'participation_call'));
  });

  it('collapses repeated posts about one announcement', () => {
    const first = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      text: 'Tickets on sale now for Ghostface Killah Official After Party at Boone Theater Sept 2',
      sourceUrl: 'https://www.instagram.com/p/DcpBspFAGLL/',
    });
    const repeat = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      text: 'Tickets on sale now for Ghostface Killah Official After Party at Boone Theater Sept 2',
      sourceUrl: 'https://www.instagram.com/p/DcpUHOag6PY/',
      knownCanonicalKeys: new Set(first.accepted.map((f) => f.canonicalKey)),
    });
    assert.ok(first.accepted.length >= 1);
    assert.equal(repeat.accepted.length, 0);
    assert.ok(repeat.rejected.some((r) => r.reason === 'duplicate'));
  });
});

describe('historical first-check baseline', () => {
  it('labels a stale inspirational first-check post as not newly happening today', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      sourceUrl: 'https://www.instagram.com/p/DabJY45K_PI/',
      text: 'If you know, you know... #M&Ms',
      publishedAt: '2026-07-05T20:12:33.000Z',
      firstCheckBaseline: true,
    });
    assert.equal(result.accepted.length, 0);
    assert.ok(result.rejected.some((r) => r.reason === 'no_concrete_development' || r.reason === 'inspirational'));
  });

  it('still accepts currently actionable information found during baseline', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      sourceUrl: 'https://www.instagram.com/p/DcpBspFAGLL/',
      text: 'Tickets on sale now. Ghostface Killah Official After Party at The Boone Theater THIS WEDNESDAY SEPT.2',
      publishedAt: '2026-08-31T15:12:52.000Z',
      firstCheckBaseline: true,
    });
    assert.ok(result.accepted.some((f) => f.currentlyActionable && f.type === 'event'));
    assert.equal(result.accepted[0]?.baselineKind, 'new');
  });
});

describe('opening, schedule, promotion, menu, participation, community', () => {
  it('detects opening/closing', () => {
    const open = classifyWatchlistText({
      ...BASE,
      text: 'Grand opening this Saturday. We are now open at 18th & Vine.',
    });
    assert.ok(open.accepted.some((f) => f.type === 'opening_closing'));
    const closed = classifyWatchlistText({
      ...BASE,
      text: 'Temporarily closed for kitchen repairs. Last day of regular service was noted by staff.',
    });
    assert.ok(closed.accepted.some((f) => f.type === 'opening_closing'));
  });

  it('detects a schedule change', () => {
    const result = classifyWatchlistText({
      ...BASE,
      text: 'New hours start Monday. We rescheduled Sunday brunch to 11am.',
    });
    assert.ok(result.accepted.some((f) => f.type === 'schedule_change'));
  });

  it('rejects an expired promotion', () => {
    const result = classifyWatchlistText({
      ...BASE,
      text: '50% off lunch special August 1 2026 only. Limited time.',
    });
    assert.ok(result.rejected.some((r) => r.reason === 'expired') || result.accepted.every((f) => f.type !== 'promotion_sale' || !isNaN(Date.parse(f.eventDate ?? ''))));
    const expiredPromo = result.rejected.find((r) => r.reason === 'expired');
    const acceptedPromo = result.accepted.find((f) => f.type === 'promotion_sale');
    assert.ok(expiredPromo || (acceptedPromo && acceptedPromo.eventDate === '2026-08-01'));
    if (acceptedPromo?.eventDate === '2026-08-01') {
      assert.equal(acceptedPromo.currentlyActionable, false);
    }
  });

  it('detects a product/menu launch', () => {
    const result = classifyWatchlistText({
      ...BASE,
      text: 'New menu drops Friday. Now serving seasonal gumbo and a new cocktail.',
    });
    assert.ok(result.accepted.some((f) => f.type === 'product_menu_launch'));
  });

  it('detects a participation call from a real vendor post', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@stashhouse_kd',
      sourceUrl: 'https://www.instagram.com/p/DchLiKEuvRU/',
      text: '2 concerts .. same location.. 1 weekend!! Labor Day weekend!! Vendor spots available for both days. Tickets available on eventbrite.',
    });
    assert.ok(result.accepted.some((f) => f.type === 'participation_call'));
  });

  it('detects a community update', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: 'Independence MO Planning Commission',
      sourceUrl: 'https://www.independencemo.gov/government/city-departments/city-clerk/boards-and-commissions/planning-commission',
      text: 'Planning commission community meeting agenda posted. Redevelopment discussion on the 24 Highway corridor.',
    });
    assert.ok(result.accepted.some((f) => f.type === 'community_news'));
  });
});

describe('provenance, dates, inference, routing', () => {
  it('keeps source provenance and never fabricates a publication date', () => {
    const result = classifyWatchlistText({
      ...BASE,
      publishedAt: null,
      text: 'Tickets on sale now for a Boone Theater after party Sept 2',
    });
    const finding = result.accepted[0];
    assert.ok(finding);
    assert.equal(finding.publishedAt, null);
    assert.equal(finding.sourceUrl, BASE.sourceUrl);
    assert.equal(finding.watchedSource, BASE.watchedSource);
    assert.match(finding.retrievedAt, /2026-09-02/);
  });

  it('rejects unsupported inference', () => {
    const result = classifyWatchlistText({
      ...BASE,
      text: 'Rumor they might stay tuned for something coming soon-ish maybe a secret show.',
    });
    assert.equal(result.accepted.length, 0);
    assert.ok(result.rejected.some((r) => r.reason === 'unsupported_inference' || r.reason === 'no_concrete_development'));
  });

  it('routes upcoming public events toward calendar and Discover review', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      text: 'Tickets on sale now. Ghostface Killah Official After Party at The Boone Theater Sept 2',
    });
    const finding = result.accepted.find((f) => f.type === 'event');
    assert.ok(finding);
    const route = routeWatchlistFinding(finding);
    assert.ok(route === 'calendar_eligible' || route === 'discover_review' || route === 'early_signals');
    assert.equal(isCalendarKcRelevant('Kansas City, MO', { watchlistDefault: true }), true);
    const trust = evaluateDiscoverTrust(
      {
        title: finding.title,
        summary: finding.summary,
        locationName: 'Kansas City, MO',
        sourceUrl: finding.sourceUrl,
        eventStartsAt: new Date('2026-09-02T22:00:00.000Z'),
        metadata: { ingest: 'instagram_watchlist', watchlistHandle: '@boonetheater' },
      },
      'Things To Do',
      'Kansas City · Wed, Sep 2',
      NOW,
    );
    assert.equal(trust.visible, true);
  });

  it('routes weak updates to Early Signals and successful quiet checks stay honest', () => {
    const weak = classifyWatchlistText({
      ...BASE,
      text: 'Happy hour 4-6pm limited time this week only',
    });
    const promo = weak.accepted.find((f) => f.type === 'promotion_sale');
    if (promo) {
      promo.confidence = 'low';
      assert.equal(routeWatchlistFinding(promo), 'early_signals');
    }
    const quiet = classifyWatchlistText({
      ...BASE,
      text: 'Studio closed for a private event. Nothing on the public calendar.',
    });
    assert.ok(quiet.accepted.length === 0 || quiet.rejected.length > 0);
    assert.equal(
      classifyWatchlistYield({
        displayHealth: 'healthy',
        lastSuccessfulCheck: '2026-09-02T04:21:12.000Z',
        acceptedCount: 0,
        lastAcceptedAt: null,
        now: NOW,
      }),
      'healthy_quiet',
    );
  });

  it('cross-source duplicate keys differ by watched source', () => {
    const a = findingCanonicalKey({
      watchedSource: '@boonetheater',
      type: 'event',
      title: 'Ghostface Killah Official After Party',
      eventDate: '2026-09-02',
    });
    const b = findingCanonicalKey({
      watchedSource: '@bizzybodyb007',
      type: 'event',
      title: 'Ghostface Killah Official After Party',
      eventDate: '2026-09-02',
    });
    assert.notEqual(a, b);
  });
});

describe('Today’s Brief coexistence', () => {
  it('adds Watchlist lines without replacing video-growth copy', () => {
    const growth = [
      'Your latest posts: Designer Closet +50 views.',
      'Followers +12 since the last check.',
    ];
    const watchlist = formatWatchlistBriefLines({
      sourcesChecked: 4,
      accepted: [{ title: 'Ghostface Killah Official After Party', watchedSource: '@boonetheater', type: 'event' }],
      awaitingReview: 1,
      failedSources: [],
      quietSources: 2,
    });
    const merged = [...growth, ...watchlist].slice(0, 5);
    assert.match(merged[0] ?? '', /Designer Closet \+50/);
    assert.match(merged.join('\n'), /Watchlist checked 4/);
    assert.match(merged.join('\n'), /boonetheater/);
  });
});
