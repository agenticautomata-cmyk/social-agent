import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasExplicitPastEventDate,
  isDiscoveryFeedFresh,
  isRelativeSeasonStaleText,
} from './content-freshness.js';

const AUG_2026 = new Date('2026-08-08T12:00:00.000Z');

describe('isRelativeSeasonStaleText', () => {
  it('flags "this spring" when it is August', () => {
    assert.equal(
      isRelativeSeasonStaleText(
        'The Country Club Plaza Will Debut A New Shopping Event This Spring',
        AUG_2026,
      ),
      true,
    );
  });

  it('allows "this spring" during spring months', () => {
    assert.equal(
      isRelativeSeasonStaleText('Pop-up market this spring in Brookside', new Date('2026-03-15T12:00:00.000Z')),
      false,
    );
  });
});

describe('hasExplicitPastEventDate', () => {
  it('flags April 2025 copy in August 2026', () => {
    assert.equal(
      hasExplicitPastEventDate('First annual market debuts in April 2025 on the Plaza', AUG_2026),
      true,
    );
  });
});

describe('isDiscoveryFeedFresh', () => {
  it('rejects undated Better Cheddar spring promo re-ingested in August', () => {
    assert.equal(
      isDiscoveryFeedFresh(
        {
          title: 'The Better Cheddar',
          hook: 'The Country Club Plaza Will Debut A New Shopping Event This Spring',
          summary: 'First annual spring market with local vendors in April 2025.',
          eventStartsAt: null,
          discoveredAt: new Date('2026-08-08T00:00:00.000Z'),
          createdAt: new Date('2026-08-08T00:00:00.000Z'),
        },
        AUG_2026,
      ),
      false,
    );
  });

  it('allows undated evergreen dining with recent ingest', () => {
    assert.equal(
      isDiscoveryFeedFresh(
        {
          title: 'New coffee shop opens in Crossroads',
          summary: 'A third-wave roaster is pouring espresso near 18th and Oak.',
          eventStartsAt: null,
          discoveredAt: new Date('2026-08-07T00:00:00.000Z'),
          createdAt: new Date('2026-08-07T00:00:00.000Z'),
        },
        AUG_2026,
      ),
      true,
    );
  });

  it('allows dated future events even with seasonal copy', () => {
    assert.equal(
      isDiscoveryFeedFresh(
        {
          title: 'Plaza Spring Market',
          hook: 'Shop local this spring',
          eventStartsAt: new Date('2026-09-15T18:00:00.000Z'),
          discoveredAt: new Date('2026-08-01T00:00:00.000Z'),
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        AUG_2026,
      ),
      true,
    );
  });
});
