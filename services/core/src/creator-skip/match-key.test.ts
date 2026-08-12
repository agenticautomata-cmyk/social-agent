import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSkipMatchIdentity, computeSkipMatchKey, skipIdentitiesMatch } from './fingerprint.js';

const KC = 'Kansas City, MO';

function identity(title: string, eventDate: string, locationName = KC) {
  const value = computeSkipMatchIdentity({ title, eventDate, locationName });
  assert.ok(value, `expected identity for ${title}`);
  return value;
}

describe('computeSkipMatchKey', () => {
  it('matches the same concert ingested with different titles, urls, and time precision', () => {
    // Real duplicate pair: one feed listed a bare date, the other a showtime.
    const dateOnly = computeSkipMatchKey({
      title: 'Don Felder Concert',
      eventDate: '2026-09-11T00:00:00.000Z',
      locationName: KC,
    });
    const withShowtime = computeSkipMatchKey({
      title: 'Don Felder',
      eventDate: '2026-09-12T01:30:00.000Z',
      locationName: KC,
    });
    assert.equal(dateOnly, withShowtime);
  });

  it('ignores html entities and casing', () => {
    assert.equal(
      computeSkipMatchKey({
        title: 'Chuck Prophet &amp; The Mission Express',
        eventDate: '2026-09-11T00:00:00.000Z',
        locationName: KC,
      }),
      computeSkipMatchKey({
        title: 'chuck prophet & the mission express',
        eventDate: '2026-09-11T00:00:00.000Z',
        locationName: KC,
      }),
    );
  });

  it('separates different acts, dates, and cities', () => {
    const felder = computeSkipMatchKey({
      title: 'Don Felder',
      eventDate: '2026-09-11T00:00:00.000Z',
      locationName: KC,
    });
    assert.notEqual(
      felder,
      computeSkipMatchKey({ title: 'Taylor Swift', eventDate: '2026-09-11T00:00:00.000Z', locationName: KC }),
    );
    assert.notEqual(
      felder,
      computeSkipMatchKey({ title: 'Don Felder', eventDate: '2026-10-04T00:00:00.000Z', locationName: KC }),
    );
    assert.notEqual(
      felder,
      computeSkipMatchKey({ title: 'Don Felder', eventDate: '2026-09-11T00:00:00.000Z', locationName: 'Dublin' }),
    );
  });

  it('returns null without an event date so undated items are not lumped together', () => {
    assert.equal(computeSkipMatchKey({ title: 'Advance Purchase Offer', locationName: KC }), null);
  });
});

describe('skipIdentitiesMatch', () => {
  it('matches when one title adds a venue', () => {
    assert.equal(
      skipIdentitiesMatch(
        identity('Don Felder', '2026-09-12T01:30:00.000Z'),
        identity('Don Felder LIVE at Ameristar', '2026-09-12T01:30:00.000Z'),
      ),
      true,
    );
  });

  it('does not let a one-word title swallow the day', () => {
    assert.equal(
      skipIdentitiesMatch(
        identity('Shows', '2026-09-11T00:00:00.000Z'),
        identity('Don Felder', '2026-09-11T00:00:00.000Z'),
      ),
      false,
    );
  });

  it('does not match different acts on the same night', () => {
    assert.equal(
      skipIdentitiesMatch(
        identity('Don Felder', '2026-09-11T00:00:00.000Z'),
        identity('The Fray', '2026-09-11T00:00:00.000Z'),
      ),
      false,
    );
  });
});
