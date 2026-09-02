import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateDiscoverTrust } from '../creator-interest/discover-trust.js';
import { isCalendarKcRelevant } from '../creator-calendar/population/eligibility.js';
import {
  classifyWatchlistText,
  classifyWatchlistYield,
  collapseWatchlistFindings,
  countWatchlistInventory,
  extractNamedOccurrence,
  findingCanonicalKey,
  formatWatchlistBriefLines,
  formatWatchlistOperationalLine,
  homeWatchlistBriefLines,
  isEngagementLedText,
  isWatchlistBriefEligible,
  routeWatchlistFinding,
  sameWatchlistOccurrence,
  summarizeWatchlistFindingForBrief,
  watchlistOccurrenceIdentityKeys,
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
      accepted: [
        {
          title: 'Ghostface Killah Official After Party',
          watchedSource: '@boonetheater',
          type: 'event',
          currentlyActionable: true,
          baselineKind: 'new',
          dateStatus: 'resolved',
          confidence: 'high',
          eventDate: '2026-09-02',
          publishedAt: '2026-08-31T15:12:52.000Z',
        },
      ],
      awaitingReview: 1,
      failedSources: [],
      quietSources: 2,
      now: NOW,
    });
    const merged = [...growth, ...watchlist].slice(0, 5);
    assert.match(merged[0] ?? '', /Designer Closet \+50/);
    assert.match(merged.join('\n'), /Watchlist checked 4/);
    assert.match(merged.join('\n'), /boonetheater/);
  });

  it('does not call Ozone’s expired reschedule New in Today’s Brief', () => {
    const lines = formatWatchlistBriefLines({
      sourcesChecked: 10,
      accepted: [
        {
          title: 'Episode 3 RESCHEDULED to 8/23/26',
          watchedSource: '@ozone_show',
          type: 'schedule_change',
          currentlyActionable: false,
          baselineKind: 'historical_baseline',
          dateStatus: 'resolved',
          confidence: 'medium',
          eventDate: '2026-08-23',
          publishedAt: '2026-08-20T18:00:00.000Z',
        },
      ],
      awaitingReview: 0,
      failedSources: [],
      quietSources: 1,
      now: NOW,
    });
    assert.doesNotMatch(lines.join('\n'), /ozone_show/);
    assert.doesNotMatch(lines.join('\n'), /Episode 3/);
    assert.doesNotMatch(lines.join('\n'), /^New from/);
  });
});

describe('false-positive precision repairs', () => {
  it('does not turn Boone FIFA free advice into an event', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      sourceUrl: 'https://www.instagram.com/p/Da4Vtd8llkF/',
      text: 'FREE ADVICE The FIFA World Cup is over. If you know, you know.',
    });
    assert.equal(result.accepted.length, 0);
    assert.ok(result.rejected.some((r) => r.reason === 'no_concrete_development'));
  });

  it('does not turn Blue Room happy-hour atmosphere into an event or promotion', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@theblueroomkc',
      sourceUrl: 'https://www.instagram.com/p/DcWLzktD1sN/',
      text: 'Some bands you meet at happy hour and never forget. Tonight they’re back. $10 per show. Tickets: americanjazzmuseum.org',
      publishedAt: '2026-08-22T01:00:00.000Z',
    });
    assert.equal(result.accepted.length, 0);
  });

  it('does not turn Blue Room debut reminiscence into a promotion', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@theblueroomkc',
      sourceUrl: 'https://www.instagram.com/p/DcoNX6xjR0k/',
      text: "Some debuts you don't forget. Tonight he's back.",
      publishedAt: '2026-08-29T02:00:00.000Z',
    });
    assert.equal(result.accepted.length, 0);
    assert.equal(result.accepted.some((f) => f.type === 'promotion_sale'), false);
  });

  it('does not turn Rio meet-and-greet into an opening/closing', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@rio.entertainment',
      sourceUrl: 'https://www.instagram.com/p/DbcGQcKu9md/',
      text: 'COME OUT AN MEET AN GREET. We going up. Good vibes. THE RE GRAND OPENING party flyer.',
    });
    assert.equal(result.accepted.some((f) => f.type === 'opening_closing'), false);
  });

  it('does not turn a ticket-sale announcement into a participation call or extra promotion', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@boonetheater',
      sourceUrl: 'https://www.instagram.com/p/DcpBspFAGLL/',
      text: 'Tickets on sale now. Ghostface Killah Official After Party at The Boone Theater THIS WEDNESDAY SEPT.2',
    });
    assert.equal(result.accepted.filter((f) => f.type === 'event').length, 1);
    assert.equal(result.accepted.some((f) => f.type === 'participation_call'), false);
    assert.equal(result.accepted.some((f) => f.type === 'promotion_sale'), false);
    assert.equal(result.accepted.length, 1);
  });

  it('keeps a $7 happy hour as a promotion without emitting extra types', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@kcrednation',
      sourceUrl: 'https://www.instagram.com/p/DcTiCunR9KP/',
      text: '1st Fridays Happy Hour $7 drink specials till 7pm',
    });
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0]?.type, 'promotion_sale');
  });

  it('does not send a throwback caption to Discover review', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@goodiesparty_',
      sourceUrl: 'https://www.instagram.com/reel/DcjRivYhHQr/',
      text: '#ThrowbackThursday tickets on sale now for the Bobby V show. Block Party energy.',
    });
    for (const finding of result.accepted) {
      assert.notEqual(routeWatchlistFinding(finding), 'discover_review');
      assert.notEqual(finding.confidence, 'high');
    }
  });
});

describe('Today’s Brief eligibility vs newly extracted', () => {
  it('labels Fish Friday currently actionable without calling it New from a stale publication', () => {
    const result = classifyWatchlistText({
      ...BASE,
      sourceUrl: 'https://www.instagram.com/p/DclohnJOqvP/',
      text: 'Fish Friday lunch special! 11am-3pm Restaurant only 3415 Main St KCMO',
      publishedAt: '2026-08-28T14:59:53.000Z',
    });
    const finding = result.accepted.find((f) => f.type === 'promotion_sale');
    assert.ok(finding);
    assert.equal(finding.currentlyActionable, true);
    assert.equal(isWatchlistBriefEligible(finding, NOW), true);
    const lines = formatWatchlistBriefLines({
      sourcesChecked: 1,
      accepted: [{ ...finding, newlyPublished: false }],
      awaitingReview: 0,
      failedSources: [],
      quietSources: 0,
      now: NOW,
    });
    assert.match(lines.join('\n'), /Watchlist:/);
    assert.match(lines.join('\n'), /Fish Friday special runs 11 AM–3 PM at 3415 Main/);
    assert.doesNotMatch(lines.join('\n'), /New from/);
  });

  it('keeps Swift truck week actionable through Labor Day Sept 7', () => {
    const result = classifyWatchlistText({
      ...BASE,
      sourceUrl: 'https://www.instagram.com/p/DcwWRQkKGwa/',
      text: 'Catch Swifts Food Truck all week long, Sept 1st until Labor Day Sept 7th, at locations throughout the KC metro.',
      publishedAt: '2026-09-01T18:52:00.000Z',
    });
    const finding = result.accepted[0];
    assert.ok(finding);
    assert.equal(finding.currentlyActionable, true);
    assert.equal(isWatchlistBriefEligible(finding, NOW), true);
  });
});

describe('Today’s Brief relevance', () => {
  const LLOYD = `Y’ALL HELP US SETTLE THE AGE-OLD QUESTION 😂🎶

We had to ask Lloyd himself… 👀

Was he saying “fine too” or “5’2”?! 😂

Either way, you already know that classic is STILL hitting! 🔥

And you can catch Lloyd LIVE at the For The Love of R&B Festival on Saturday, September 5th at Grandview Amphitheater! 🎤🔥`;

  it('rejects the Lloyd/5’2 poll even when a buried concert sentence exists', () => {
    const result = classifyWatchlistText({
      ...BASE,
      watchedSource: '@theepitomekc',
      sourceUrl: 'https://www.instagram.com/reel/DcjYHWoiyba/',
      text: LLOYD,
    });
    assert.equal(result.accepted.length, 0);
    assert.ok(result.rejected.some((r) => r.reason === 'engagement_bait'));
    assert.equal(isEngagementLedText(LLOYD), true);
  });

  it('does not put Lloyd/5’2 in Today’s Brief when a useful special also exists', () => {
    const lloydFinding = {
      title: 'Y’ALL HELP US SETTLE THE AGE-OLD QUESTION 😂🎶 We had to ask Lloyd himself… 👀 Was he saying “fine too” or “5’2”?!',
      watchedSource: '@theepitomekc',
      type: 'event',
      currentlyActionable: true,
      baselineKind: 'new',
      dateStatus: 'resolved',
      confidence: 'high',
      eventDate: '2026-09-05',
      publishedAt: '2026-09-02T06:47:18.000Z',
      evidence: LLOYD,
    };
    const fish = classifyWatchlistText({
      ...BASE,
      sourceUrl: 'https://www.instagram.com/p/DclohnJOqvP/',
      text: 'Fish Friday lunch special! 11am-3pm Restaurant only 3415 Main St KCMO',
      publishedAt: '2026-08-28T14:59:53.000Z',
    }).accepted[0];
    assert.ok(fish);
    assert.equal(isWatchlistBriefEligible(lloydFinding, NOW), false);
    const lines = formatWatchlistBriefLines({
      sourcesChecked: 36,
      accepted: [lloydFinding, { ...fish, watchedSource: '@swiftscajuncuisine' }],
      awaitingReview: 14,
      failedSources: [],
      quietSources: 0,
      now: NOW,
      includeOperationalExtras: false,
    });
    assert.doesNotMatch(lines.join('\n'), /Lloyd|fine too|5’2|HELP US SETTLE/i);
    assert.match(lines.join('\n'), /Fish Friday special runs 11 AM–3 PM at 3415 Main/);
    const home = homeWatchlistBriefLines(
      formatWatchlistBriefLines({
        sourcesChecked: 36,
        accepted: [lloydFinding, { ...fish, watchedSource: '@swiftscajuncuisine' }],
        awaitingReview: 14,
        failedSources: [],
        quietSources: 0,
        now: NOW,
      }),
    );
    assert.equal(home.some((l) => /awaiting review/i.test(l)), false);
    assert.equal(home.length <= 2, true);
  });

  it('ranks cancellations above vendor calls, specials, and ordinary events', () => {
    const lines = formatWatchlistBriefLines({
      sourcesChecked: 10,
      accepted: [
        {
          title: 'Ghostface Killah Official After Party',
          watchedSource: '@boonetheater',
          type: 'event',
          currentlyActionable: true,
          baselineKind: 'new',
          dateStatus: 'resolved',
          confidence: 'high',
          eventDate: '2026-09-02',
        },
        {
          title: 'Fish Friday lunch special!',
          watchedSource: '@swiftscajuncuisine',
          type: 'promotion_sale',
          currentlyActionable: true,
          baselineKind: 'new',
          dateStatus: 'resolved',
          confidence: 'medium',
          eventDate: null,
          evidence: 'Fish Friday lunch special! 11am-3pm Restaurant only 3415 Main St KCMO',
        },
        {
          title: '2 concerts .. vendor spots both days',
          watchedSource: '@stashhouse_kd',
          type: 'participation_call',
          currentlyActionable: true,
          baselineKind: 'new',
          dateStatus: 'resolved',
          confidence: 'medium',
          eventDate: '2026-09-05',
          evidence: 'Vendor spots both days, Labor Day weekend',
        },
        {
          title: 'Due to the storm, today’s event has been canceled.',
          watchedSource: '@blackfoodtruckfridays',
          type: 'schedule_change',
          currentlyActionable: true,
          baselineKind: 'new',
          dateStatus: 'resolved',
          confidence: 'medium',
          eventDate: '2026-09-04',
          evidence: 'Due to the storm, today’s event has been canceled. Join us next week Sept 4.',
        },
      ],
      awaitingReview: 0,
      failedSources: [],
      quietSources: 0,
      now: NOW,
      includeOperationalExtras: false,
    });
    assert.match(lines.join('\n'), /Next date is Friday, September 4, 2026/);
    assert.doesNotMatch(lines.join('\n'), /Ghostface/);
    assert.doesNotMatch(lines.join('\n'), /^Watchlist: @blackfoodtruckfridays: \d+ (AM|PM)/);
  });

  it('ranks a material schedule window above a special when no cancellation exists', () => {
    const lines = formatWatchlistBriefLines({
      sourcesChecked: 4,
      accepted: [
        {
          title: 'Fish Friday lunch special!',
          watchedSource: '@swiftscajuncuisine',
          type: 'promotion_sale',
          currentlyActionable: true,
          baselineKind: 'new',
          dateStatus: 'resolved',
          confidence: 'medium',
          eventDate: null,
          evidence: 'Fish Friday lunch special! 11am-3pm Restaurant only 3415 Main St KCMO',
        },
        {
          title: 'Catch Swifts Food Truck all week long',
          watchedSource: '@swiftscajuncuisine',
          type: 'schedule_change',
          currentlyActionable: true,
          baselineKind: 'new',
          dateStatus: 'resolved',
          confidence: 'medium',
          eventDate: '2026-09-01',
          endIsoDate: '2026-09-07',
          evidence: 'Catch Swifts Food Truck all week long, Sept 1st until Labor Day Sept 7th',
        },
      ],
      awaitingReview: 0,
      failedSources: [],
      quietSources: 0,
      now: NOW,
      includeOperationalExtras: false,
    });
    assert.match(lines.join('\n'), /Food truck is out all week through Labor Day, September 7/);
    assert.doesNotMatch(lines.join('\n'), /Fish Friday/);
  });

  it('does not fill a Brief slot with a poll, meme, or vague caption', () => {
    const lines = formatWatchlistBriefLines({
      sourcesChecked: 36,
      accepted: [
        {
          title: 'What are you doing in Kansas City this weekend?',
          watchedSource: '@kclifestylegirl',
          type: 'event',
          currentlyActionable: true,
          baselineKind: 'new',
          dateStatus: 'resolved',
          confidence: 'medium',
          eventDate: null,
          evidence: 'What are you doing in Kansas City this weekend?',
        },
      ],
      awaitingReview: 0,
      failedSources: [],
      quietSources: 12,
      now: NOW,
      includeOperationalExtras: false,
    });
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /Watchlist checked 36/);
    assert.doesNotMatch(lines.join('\n'), /What are you doing/);
  });

  it('states a concrete development instead of a caption fragment', () => {
    const sentence = summarizeWatchlistFindingForBrief({
      title: 'Fish Friday lunch special!',
      type: 'promotion_sale',
      currentlyActionable: true,
      baselineKind: 'new',
      dateStatus: 'resolved',
      confidence: 'medium',
      eventDate: null,
      evidence: 'Fish Friday lunch special! 11am-3pm Restaurant only 3415 Main St KCMO',
    });
    assert.equal(sentence, 'Fish Friday special runs 11 AM–3 PM at 3415 Main.');
  });
});

const STORM_CANCEL = {
  title: 'Due to the storm, today’s event has been canceled.',
  type: 'schedule_change' as const,
  currentlyActionable: true,
  baselineKind: 'new' as const,
  dateStatus: 'resolved' as const,
  confidence: 'medium' as const,
  eventDate: '2026-09-04',
  publishedAt: '2026-08-28T21:00:00.000Z',
  evidence: 'Due to the storm, today’s event has been canceled. Join us next week Sept 4.',
  watchedSource: '@blackfoodtruckfridays',
};

describe('storm-cancel next-date uses injected America/Chicago time', () => {
  it('never depends on a hard-coded September 2026 floor', () => {
    assert.equal(
      summarizeWatchlistFindingForBrief(STORM_CANCEL, new Date('2026-09-02T12:00:00.000Z')),
      'Next date is Friday, September 4, 2026.',
    );
  });

  it('covers canceled occurrence, replacement date, Chicago midnight, and year boundary', () => {
    const cases: Array<{ now: Date; expectNext: boolean; label: string }> = [
      { now: new Date('2026-08-27T17:00:00.000Z'), expectNext: true, label: 'before canceled occurrence' },
      { now: new Date('2026-08-28T17:00:00.000Z'), expectNext: true, label: 'on canceled occurrence date' },
      { now: new Date('2026-08-29T17:00:00.000Z'), expectNext: true, label: 'after canceled occurrence' },
      { now: new Date('2026-09-03T17:00:00.000Z'), expectNext: true, label: 'before replacement date' },
      { now: new Date('2026-09-04T17:00:00.000Z'), expectNext: true, label: 'on replacement date' },
      { now: new Date('2026-09-05T17:00:00.000Z'), expectNext: false, label: 'after replacement date' },
      { now: new Date('2026-08-29T04:59:00.000Z'), expectNext: true, label: 'before Chicago midnight after cancel day' },
      { now: new Date('2026-08-29T05:01:00.000Z'), expectNext: true, label: 'after Chicago midnight into the next day' },
    ];
    for (const row of cases) {
      const sentence = summarizeWatchlistFindingForBrief(STORM_CANCEL, row.now);
      const eligible = isWatchlistBriefEligible(STORM_CANCEL, row.now);
      if (row.expectNext) {
        assert.equal(sentence, 'Next date is Friday, September 4, 2026.', row.label);
        assert.equal(eligible, true, row.label);
      } else {
        assert.equal(sentence, null, row.label);
        assert.equal(eligible, false, row.label);
      }
      assert.doesNotMatch(sentence ?? '', /canceled today/i, row.label);
    }

    const yearBoundary = {
      ...STORM_CANCEL,
      eventDate: '2027-01-08',
      publishedAt: '2026-12-31T22:00:00.000Z',
      evidence: 'Due to the storm, today’s event has been canceled. Join us Friday Jan 8.',
    };
    assert.equal(
      summarizeWatchlistFindingForBrief(yearBoundary, new Date('2026-12-31T17:00:00.000Z')),
      'Next date is Friday, January 8, 2027.',
    );
    assert.equal(
      summarizeWatchlistFindingForBrief(yearBoundary, new Date('2027-01-01T05:59:00.000Z')),
      'Next date is Friday, January 8, 2027.',
    );
    assert.equal(
      summarizeWatchlistFindingForBrief(yearBoundary, new Date('2027-01-01T06:01:00.000Z')),
      'Next date is Friday, January 8, 2027.',
    );
    assert.equal(summarizeWatchlistFindingForBrief(yearBoundary, new Date('2027-01-09T12:00:00.000Z')), null);
    assert.equal(isWatchlistBriefEligible(yearBoundary, new Date('2027-01-09T12:00:00.000Z')), false);
    assert.doesNotMatch(
      summarizeWatchlistFindingForBrief(yearBoundary, new Date('2027-01-02T12:00:00.000Z')) ?? '',
      /canceled today/i,
    );
  });

  it('does not revive stale canceled-today language after the canceled occurrence', () => {
    const stale = {
      ...STORM_CANCEL,
      eventDate: '2026-08-28',
    };
    const after = new Date('2026-08-29T17:00:00.000Z');
    assert.equal(summarizeWatchlistFindingForBrief(stale, after), null);
    assert.equal(isWatchlistBriefEligible(stale, after), false);
    const lines = formatWatchlistBriefLines({
      sourcesChecked: 1,
      accepted: [{ ...stale, watchedSource: '@blackfoodtruckfridays' }],
      awaitingReview: 0,
      failedSources: [],
      quietSources: 0,
      now: after,
      includeOperationalExtras: false,
    });
    assert.doesNotMatch(lines.join('\n'), /canceled today/i);
  });
});

describe('cross-source Watchlist occurrence identity', () => {
  const festival = {
    title: 'For the Love of R&B Festival featuring Jacquees, Lloyd & more!',
    eventDate: '2026-09-05',
    venue: 'Grandview Amphitheater',
    evidence: 'For the Love of R&B Festival featuring Jacquees, Lloyd & more! Saturday Sept 5 Grandview Amphitheater',
    type: 'curator_event_lead',
  };
  const epitomekc = {
    title: 'I KNOW y’all know them Jacquees songs!',
    eventDate: '2026-09-05' as string | null,
    venue: 'Grandview Amphitheater',
    evidence:
      'Come see Jacquees LIVE this Saturday at Grandview Amphitheater for the For The Love of R&B Festival! Featuring Jacquees, H-Town, Lloyd.',
    type: 'event',
  };

  it('extracts the same festival identity from stashhouse and epitomekc captions', () => {
    assert.equal(extractNamedOccurrence(festival.title, festival.evidence), extractNamedOccurrence(epitomekc.title, epitomekc.evidence));
    assert.equal(sameWatchlistOccurrence(festival, epitomekc), true);
  });

  it('keeps the strongest finding and both provenance URLs', () => {
    const stashhouse = classifyWatchlistText({
      ...BASE,
      watchedSource: '@stashhouse_kd',
      sourceUrl: 'https://www.instagram.com/p/DcKOtQUjStw/',
      text: 'For the Love of R&B Festival featuring Jacquees, Lloyd & more! Saturday Sept 5 at Grandview Amphitheater. Tickets on sale now.',
      publishedAt: '2026-08-20T18:00:00.000Z',
    });
    const jacquees = classifyWatchlistText({
      ...BASE,
      watchedSource: '@theepitomekc',
      sourceUrl: 'https://www.instagram.com/reel/DctvyNEM07C/',
      text: 'Come see Jacquees LIVE this Saturday at Grandview Amphitheater for the For The Love of R&B Festival! Featuring Jacquees, H-Town, Lloyd.',
      publishedAt: '2026-09-01T18:00:00.000Z',
    });
    assert.ok(stashhouse.accepted.some((f) => f.type === 'event'));
    assert.ok(jacquees.accepted.some((f) => f.type === 'event'));
    const merged = collapseWatchlistFindings([...stashhouse.accepted, ...jacquees.accepted]);
    const events = merged.filter((f) => f.type === 'event');
    assert.equal(events.length, 1);
    assert.ok(events[0]?.provenanceUrls?.includes('https://www.instagram.com/p/DcKOtQUjStw/'));
    assert.ok(events[0]?.provenanceUrls?.includes('https://www.instagram.com/reel/DctvyNEM07C/'));
    assert.match(events[0]?.title ?? '', /For the Love of R&B Festival/i);
  });

  it('rejects the Lloyd poll and does not treat it as festival provenance', () => {
    const poll = classifyWatchlistText({
      ...BASE,
      watchedSource: '@theepitomekc',
      sourceUrl: 'https://www.instagram.com/reel/DcjYHWoiyba/',
      text: 'Y’ALL HELP US SETTLE THE AGE-OLD QUESTION 😂🎶 We had to ask Lloyd himself… 👀 Was he saying “fine too” or “5’2”?! Either way you can catch Lloyd LIVE at the For The Love of R&B Festival Saturday September 5 Grandview Amphitheater.',
      publishedAt: '2026-08-30T18:00:00.000Z',
    });
    assert.equal(poll.accepted.length, 0);
    assert.ok(poll.rejected.some((r) => r.reason === 'engagement_bait'));
  });

  it('does not merge unrelated events that only share a performer, venue, or date', () => {
    assert.equal(
      sameWatchlistOccurrence(festival, {
        title: 'That Mexican OT & Friends LIVE',
        eventDate: '2026-09-05',
        venue: 'Grandview Amphitheater',
        type: 'event',
      }),
      false,
    );
    assert.equal(
      sameWatchlistOccurrence(festival, {
        title: 'Lloyd LIVE at The Midland',
        eventDate: '2026-09-05',
        venue: 'The Midland',
        type: 'event',
      }),
      false,
    );
    assert.equal(
      sameWatchlistOccurrence(festival, {
        title: 'For the Love of R&B Festival',
        eventDate: '2026-09-03',
        venue: 'Grandview Amphitheater',
        type: 'curator_event_lead',
      }),
      false,
    );
    assert.equal(
      sameWatchlistOccurrence(
        {
          ...epitomekc,
          eventDate: null,
          publishedAt: '2026-09-01T18:00:00.000Z',
          now: new Date('2026-09-02T12:00:00.000Z'),
        },
        festival,
      ),
      true,
    );
  });

  it('rejects a later Watchlist check of the same festival as a duplicate', () => {
    const known = new Set(
      watchlistOccurrenceIdentityKeys({
        title: festival.title,
        eventDate: festival.eventDate,
        venue: festival.venue,
        evidence: festival.evidence,
        type: 'curator_event_lead',
      }),
    );
    const later = classifyWatchlistText({
      ...BASE,
      watchedSource: '@theepitomekc',
      sourceUrl: 'https://www.instagram.com/reel/DctvyNEM07C/',
      text: 'Come see Jacquees LIVE this Saturday at Grandview Amphitheater for the For The Love of R&B Festival! Featuring Jacquees, H-Town, Lloyd.',
      publishedAt: '2026-09-01T18:00:00.000Z',
      knownCanonicalKeys: known,
    });
    assert.equal(later.accepted.filter((f) => f.type === 'event').length, 0);
    assert.ok(later.rejected.some((r) => r.reason === 'duplicate'));
  });
});

describe('Watchlist operational count', () => {
  const since = new Date('2026-09-01T00:00:00.000Z');
  const base = {
    paused: false,
    sessionStatus: 'ready' as string | null,
    authenticationRequired: false,
    lastAttemptedCheck: new Date('2026-09-02T04:00:00.000Z'),
    lastFailureAt: null as Date | null,
    lastFailureMessage: undefined as string | undefined,
  };

  it('uses a simple sentence when every active source was successfully checked', () => {
    assert.equal(
      formatWatchlistOperationalLine({ successfullyChecked: 42, activeEnabled: 42 }),
      'Watchlist checked 42 sources.',
    );
    const counts = countWatchlistInventory(
      [
        {
          id: 'a',
          enabled: true,
          healthStatus: 'healthy',
          lastSuccessfulCheck: new Date('2026-09-02T04:00:00.000Z'),
          ...base,
        },
        {
          id: 'b',
          enabled: true,
          healthStatus: 'healthy',
          lastSuccessfulCheck: new Date('2026-09-02T05:00:00.000Z'),
          ...base,
        },
      ],
      { since },
    );
    assert.equal(counts.activeEnabled, 2);
    assert.equal(counts.successfullyChecked, 2);
    assert.equal(counts.stoppedOrUnsupported, 0);
    assert.equal(
      formatWatchlistOperationalLine(counts),
      'Watchlist checked 2 sources.',
    );
  });

  it('reports a partial inventory with remaining ready sources', () => {
    const counts = countWatchlistInventory(
      [
        {
          id: 'checked',
          enabled: true,
          healthStatus: 'healthy',
          lastSuccessfulCheck: new Date('2026-09-02T04:00:00.000Z'),
          ...base,
        },
        {
          id: 'ready',
          enabled: true,
          healthStatus: 'pending',
          lastSuccessfulCheck: null,
          lastAttemptedCheck: null,
          paused: false,
          sessionStatus: 'ready',
          authenticationRequired: false,
          lastFailureAt: null,
        },
      ],
      { since },
    );
    assert.equal(counts.successfullyChecked, 1);
    assert.equal(counts.activeEnabled, 2);
    assert.equal(counts.readyUnprocessed, 1);
    assert.equal(
      formatWatchlistOperationalLine(counts),
      'Watchlist checked 1 of 2 active sources; 1 remains ready.',
    );
  });

  it('does not count stopped sources as successfully checked', () => {
    const counts = countWatchlistInventory(
      [
        {
          id: 'active',
          enabled: true,
          healthStatus: 'healthy',
          lastSuccessfulCheck: new Date('2026-09-02T04:00:00.000Z'),
          ...base,
        },
        {
          id: 'stopped',
          enabled: false,
          healthStatus: 'disabled',
          lastSuccessfulCheck: new Date('2026-09-02T04:00:00.000Z'),
          ...base,
        },
      ],
      { since },
    );
    assert.equal(counts.successfullyChecked, 1);
    assert.equal(counts.activeEnabled, 1);
    assert.equal(counts.stoppedOrUnsupported, 1);
    assert.equal(formatWatchlistOperationalLine(counts), 'Watchlist checked 1 source.');
  });

  it('distinguishes failed and blocked sources from successful checks', () => {
    const counts = countWatchlistInventory(
      [
        {
          id: 'ok',
          enabled: true,
          healthStatus: 'healthy',
          lastSuccessfulCheck: new Date('2026-09-02T04:00:00.000Z'),
          ...base,
        },
        {
          id: 'failed',
          enabled: true,
          healthStatus: 'failed',
          lastSuccessfulCheck: null,
          lastAttemptedCheck: new Date('2026-09-02T04:00:00.000Z'),
          lastFailureAt: new Date('2026-09-02T04:00:00.000Z'),
          lastFailureMessage: 'timeout',
          paused: false,
          sessionStatus: 'ready',
          authenticationRequired: false,
        },
        {
          id: 'blocked',
          enabled: true,
          healthStatus: 'login_required',
          lastSuccessfulCheck: null,
          lastAttemptedCheck: new Date('2026-09-02T04:00:00.000Z'),
          lastFailureAt: new Date('2026-09-02T04:00:00.000Z'),
          paused: false,
          sessionStatus: 'login_required',
          authenticationRequired: true,
        },
      ],
      { since },
    );
    assert.equal(counts.successfullyChecked, 1);
    assert.equal(counts.activeEnabled, 3);
    assert.equal(counts.failedOrBlocked, 2);
    assert.match(
      formatWatchlistOperationalLine(counts) ?? '',
      /Watchlist checked 1 of 3 active sources; 2 failed or blocked/,
    );
  });
});
