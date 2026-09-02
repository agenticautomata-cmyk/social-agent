import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isWatcherDue,
  nextScheduledCheckAt,
  watchlistDisplayHealth,
} from './watchlist-state.js';
import { instagramPostIdentityKeys } from './instagram-url.js';
import { formatInstagramWatchInspectionSummary } from './watch-inspection.js';
import { evaluateDiscoverTrust } from '../creator-interest/discover-trust.js';
import { isCalendarKcRelevant } from '../creator-calendar/population/eligibility.js';

const HOURS = 12 * 60 * 60 * 1000;
const NOW = new Date('2026-09-02T12:00:00.000Z');

describe('watchlist next-check and display health', () => {
  it('schedules the next 12h check after a success', () => {
    const next = nextScheduledCheckAt({
      enabled: true,
      paused: false,
      checkFrequencyMs: HOURS,
      lastSuccessfulCheck: new Date('2026-09-02T00:00:00.000Z'),
      lastAttemptedCheck: new Date('2026-09-02T00:00:00.000Z'),
      now: NOW,
    });
    assert.equal(next?.toISOString(), '2026-09-02T12:00:00.000Z');
  });

  it('never-checked ready sources are due now, not blank', () => {
    const next = nextScheduledCheckAt({
      enabled: true,
      paused: false,
      checkFrequencyMs: HOURS,
      lastSuccessfulCheck: null,
      lastAttemptedCheck: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      now: NOW,
    });
    assert.equal(next?.toISOString(), NOW.toISOString());
    assert.equal(
      isWatcherDue({
        lastSuccessfulCheck: null,
        lastAttemptedCheck: null,
        checkFrequencyMs: HOURS,
        lastFailureAt: null,
        authenticationRequired: false,
        now: NOW,
      }),
      true,
    );
  });

  it('retries a missing-browser failure after 15 minutes, not 12 hours', () => {
    const attempted = new Date('2026-09-02T11:50:00.000Z');
    const next = nextScheduledCheckAt({
      enabled: true,
      paused: false,
      checkFrequencyMs: HOURS,
      lastSuccessfulCheck: null,
      lastAttemptedCheck: attempted,
      lastFailureMessage: "browserType.launch: Executable doesn't exist at /tmp/chrome",
      now: NOW,
    });
    assert.equal(next?.toISOString(), '2026-09-02T12:05:00.000Z');
    assert.equal(
      isWatcherDue({
        lastSuccessfulCheck: null,
        lastAttemptedCheck: attempted,
        checkFrequencyMs: HOURS,
        lastFailureAt: attempted,
        lastFailureMessage: "browserType.launch: Executable doesn't exist",
        authenticationRequired: false,
        now: NOW,
      }),
      false,
    );
  });

  it('maps honest display states from worker fields', () => {
    assert.equal(
      watchlistDisplayHealth({
        enabled: true,
        paused: false,
        healthStatus: 'pending',
        sessionStatus: 'ready',
        authenticationRequired: false,
        lastSuccessfulCheck: null,
        lastAttemptedCheck: null,
        lastFailureAt: null,
      }),
      'ready',
    );
    assert.equal(
      watchlistDisplayHealth({
        enabled: true,
        paused: false,
        healthStatus: 'healthy',
        sessionStatus: 'ready',
        authenticationRequired: false,
        lastSuccessfulCheck: NOW,
        lastAttemptedCheck: NOW,
        lastFailureAt: null,
      }),
      'healthy',
    );
    assert.equal(
      watchlistDisplayHealth({
        enabled: true,
        paused: false,
        healthStatus: 'failed',
        sessionStatus: 'ready',
        authenticationRequired: false,
        lastSuccessfulCheck: null,
        lastAttemptedCheck: NOW,
        lastFailureAt: NOW,
        lastFailureMessage: "Executable doesn't exist",
      }),
      'degraded',
    );
    assert.equal(
      watchlistDisplayHealth({
        enabled: true,
        paused: true,
        healthStatus: 'login_required',
        sessionStatus: 'login_required',
        authenticationRequired: true,
        lastSuccessfulCheck: null,
        lastAttemptedCheck: null,
        lastFailureAt: NOW,
      }),
      'blocked',
    );
    assert.equal(
      watchlistDisplayHealth({
        enabled: true,
        paused: false,
        healthStatus: 'pending',
        sessionStatus: 'ready',
        authenticationRequired: false,
        lastSuccessfulCheck: null,
        lastAttemptedCheck: NOW,
        lastFailureAt: null,
        checkInProgress: true,
      }),
      'checking',
    );
  });
});

describe('incremental post identity and inspection', () => {
  it('treats the same Instagram shortcode as one post across tracking URLs', () => {
    const a = instagramPostIdentityKeys('https://www.instagram.com/p/AbCdef123/?utm_source=ig');
    const b = instagramPostIdentityKeys('https://instagram.com/p/AbCdef123/');
    assert.ok(a.some((key) => b.includes(key)));
  });

  it('keeps every new post in a batch and suppresses already-known history', () => {
    const known = new Set(instagramPostIdentityKeys('https://www.instagram.com/p/OLDPOST12/'));
    const batch = [
      'https://www.instagram.com/p/NEWAAA111/',
      'https://www.instagram.com/p/NEWBBB222/',
      'https://www.instagram.com/p/OLDPOST12/',
    ];
    const fresh = batch.filter((url) => !instagramPostIdentityKeys(url).some((key) => known.has(key)));
    assert.deepEqual(fresh, [
      'https://www.instagram.com/p/NEWAAA111/',
      'https://www.instagram.com/p/NEWBBB222/',
    ]);
  });

  it('says nothing new when the profile opened and every post was already known', () => {
    const summary = formatInstagramWatchInspectionSummary({
      profileOpened: true,
      postsDiscovered: 4,
      alreadyKnown: 4,
      newlyInspected: 0,
      extracted: 0,
      skipped: [
        { url: 'https://instagram.com/p/a/', reason: 'already_processed' },
        { url: 'https://instagram.com/p/b/', reason: 'already_processed' },
      ],
      failed: [],
    });
    assert.match(summary, /4 already processed/);
    assert.match(summary, /0 new/);
  });

  it('rejects page-chrome skip reasons without treating them as new findings', () => {
    const summary = formatInstagramWatchInspectionSummary({
      profileOpened: true,
      postsDiscovered: 3,
      alreadyKnown: 1,
      newlyInspected: 1,
      extracted: 0,
      skipped: [
        { url: 'https://instagram.com/p/x/', reason: 'already_processed' },
        { url: 'https://instagram.com/explore/', reason: 'navigation_chrome' },
      ],
      failed: [],
    });
    assert.match(summary, /1 skipped/);
    assert.doesNotMatch(summary, /followers|suggested/i);
  });
});

describe('downstream compatibility', () => {
  it('Watchlist provenance stays Discover-trust compatible', () => {
    const trust = evaluateDiscoverTrust(
      {
        title: 'Boone Theater live jazz night',
        summary: 'Boone Theater announced a dated show on their Instagram.',
        locationName: 'Columbia, MO',
        sourceUrl: 'https://www.instagram.com/p/WatchlistProvenance1/',
        eventStartsAt: new Date('2026-09-06T22:00:00.000Z'),
        metadata: { ingest: 'instagram_watchlist', watchlistHandle: '@boonetheater' },
      },
      'Things To Do',
      'Columbia · Sun, Sep 6',
      NOW,
    );
    assert.equal(trust.visible, true);
    assert.match(trust.whyItMatters ?? '', /Boone Theater|dated show/i);
  });

  it('calendar KC relevance still accepts a verified Watchlist venue', () => {
    assert.equal(isCalendarKcRelevant('Kansas City, MO', { watchlistDefault: true }), true);
  });
});
