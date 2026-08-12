import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeSkipMatchIdentity,
  isSkippedByMatchers,
  resolveSkipIdentityKey,
  type SkipMatchers,
} from './index.js';

describe('isSkippedByMatchers', () => {
  it('hides re-ingested duplicates via identity when contentItemIds is empty', () => {
    const skippedItem = {
      id: 'original-id',
      title: 'Poetry Night',
      eventDate: '2026-08-01T19:00:00.000Z',
      locationName: 'Lucile Bluford Library',
      formattedAddress: 'Kansas City, MO',
      sourceUrl: 'https://instagram.com/p/abc123/',
    };
    const identity = computeSkipMatchIdentity(skippedItem);
    assert.ok(identity);

    const reingested = {
      ...skippedItem,
      id: 'new-ingest-id',
      title: 'Poetry Night at Lucile Bluford Library',
      sourceUrl: 'https://instagram.com/p/xyz999/',
    };

    const matchers: SkipMatchers = {
      contentItemIds: new Set<string>(),
      skipIdentityKeys: new Set([identity!.key]),
      fingerprints: new Set<string>(),
      identities: [identity!],
    };

    assert.equal(isSkippedByMatchers(matchers, reingested), true);
  });

  it('does not suppress a different date for the same performer (event-level skip)', () => {
    const skipped = computeSkipMatchIdentity({
      title: 'Don Felder Concert',
      eventDate: '2026-09-11T00:00:00.000Z',
      locationName: 'Kansas City, MO',
    });
    assert.ok(skipped);

    const matchers: SkipMatchers = {
      contentItemIds: new Set<string>(),
      skipIdentityKeys: new Set([skipped.key]),
      fingerprints: new Set<string>(),
      identities: [skipped],
    };

    assert.equal(
      isSkippedByMatchers(matchers, {
        id: 'new-oct-ingest',
        title: 'Don Felder Concert',
        eventDate: '2026-10-04T00:00:00.000Z',
        locationName: 'Kansas City, MO',
      }),
      false,
    );
  });

  it('uses durable skip_identity_key without content item id', () => {
    const skipped = computeSkipMatchIdentity({
      title: 'Don Felder Concert',
      eventDate: '2026-09-11T00:00:00.000Z',
      locationName: 'Kansas City, MO',
    });
    assert.ok(skipped);

    const matchers: SkipMatchers = {
      contentItemIds: new Set<string>(),
      skipIdentityKeys: new Set([skipped.key]),
      fingerprints: new Set<string>(),
      identities: [skipped],
    };

    assert.equal(
      isSkippedByMatchers(matchers, {
        id: 'reingested-id',
        title: 'Don Felder LIVE at Ameristar',
        eventDate: '2026-09-12T01:30:00.000Z',
        locationName: 'Kansas City, MO',
        sourceUrl: 'https://other-tickets.example/don-felder',
      }),
      true,
    );
  });
});
