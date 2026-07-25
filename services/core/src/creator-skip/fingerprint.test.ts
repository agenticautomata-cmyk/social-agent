import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeOccurrenceFingerprint } from './fingerprint.js';

describe('computeOccurrenceFingerprint', () => {
  it('is stable for the same occurrence fields', () => {
    const input = {
      title: 'Frosty Frogs Opening',
      eventDate: '2026-08-01T18:00:00.000Z',
      locationName: 'Kansas City, MO',
      sourceUrl: 'https://example.com/event',
    };
    const a = computeOccurrenceFingerprint(input);
    const b = computeOccurrenceFingerprint(input);
    assert.equal(a, b);
  });

  it('changes when event date changes', () => {
    const base = {
      title: 'Frosty Frogs Opening',
      eventDate: '2026-08-01T18:00:00.000Z',
      locationName: 'Kansas City, MO',
    };
    const changed = computeOccurrenceFingerprint({ ...base, eventDate: '2026-08-02T18:00:00.000Z' });
    assert.notEqual(computeOccurrenceFingerprint(base), changed);
  });

  it('changes when location changes', () => {
    const base = {
      title: 'Frosty Frogs Opening',
      eventDate: '2026-08-01T18:00:00.000Z',
      locationName: 'Kansas City, MO',
    };
    const changed = computeOccurrenceFingerprint({ ...base, locationName: 'Overland Park, KS' });
    assert.notEqual(computeOccurrenceFingerprint(base), changed);
  });
});
