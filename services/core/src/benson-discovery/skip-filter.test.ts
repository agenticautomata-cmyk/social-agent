import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSkipMatchIdentity, isSkippedByMatchers, type SkipMatchers } from '../creator-skip/index.js';

describe('discovery skip authority', () => {
  const skipped = computeSkipMatchIdentity({
    title: 'Don Felder Concert',
    eventDate: '2026-09-11T00:00:00.000Z',
    locationName: 'Kansas City, MO',
  });
  assert.ok(skipped);

  const matchers: SkipMatchers = {
    contentItemIds: new Set(['original-id']),
    skipIdentityKeys: new Set([skipped.key]),
    fingerprints: new Set<string>(),
    identities: [skipped],
  };

  it('suppresses same event from different source URL', () => {
    assert.equal(
      isSkippedByMatchers(matchers, {
        id: 'new-id',
        title: 'Don Felder LIVE at Ameristar',
        eventDate: '2026-09-12T01:30:00.000Z',
        locationName: 'Kansas City, MO',
        sourceUrl: 'https://other.example/tickets',
      }),
      true,
    );
  });

  it('allows same performer on a different date', () => {
    assert.equal(
      isSkippedByMatchers(matchers, {
        id: 'oct-id',
        title: 'Don Felder Concert',
        eventDate: '2026-10-04T00:00:00.000Z',
        locationName: 'Kansas City, MO',
        sourceUrl: 'https://other.example/oct',
      }),
      false,
    );
  });
});
