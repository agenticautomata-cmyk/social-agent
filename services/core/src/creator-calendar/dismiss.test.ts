import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeOccurrenceFingerprint, computeSkipMatchIdentity } from '../creator-skip/fingerprint.js';

describe('calendar dismissal fingerprints', () => {
  it('same logical event shares a skip identity across Instagram and website titles', () => {
    const ig = computeSkipMatchIdentity({
      title: 'Wine Down Sundays',
      eventDate: '2026-08-16T19:00:00.000Z',
      venue: 'Juke House',
    });
    const site = computeSkipMatchIdentity({
      title: 'Wine Down Sundays at Juke House',
      eventDate: '2026-08-16T19:00:00.000Z',
      venue: 'Juke House',
    });
    assert.ok(ig);
    assert.ok(site);
    assert.equal(ig!.day, site!.day);
    assert.equal(ig!.venue, site!.venue);
  });

  it('occurrence fingerprints differ when the source URL differs', () => {
    const a = computeOccurrenceFingerprint({
      title: 'Wine Down Sundays',
      eventDate: '2026-08-16',
      venue: 'Juke House',
      sourceUrl: 'https://instagram.com/p/1',
    });
    const b = computeOccurrenceFingerprint({
      title: 'Wine Down Sundays',
      eventDate: '2026-08-16',
      venue: 'Juke House',
      sourceUrl: 'https://jukehousekc.com/wine-down',
    });
    assert.notEqual(a, b);
  });
});
