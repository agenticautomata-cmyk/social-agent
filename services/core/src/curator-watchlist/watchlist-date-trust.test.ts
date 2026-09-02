import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dateAgreesWithExplicitWeekday,
  nextWeekdayIso,
  reconcileStatedDateWithWeekday,
  resolveWatchlistDate,
  utcWeekdayFromIsoDate,
  weekdayNameFromIsoDate,
} from './watchlist-date-trust.js';

describe('watchlist date trust', () => {
  it('treats 2026-09-05 as Saturday, not Monday', () => {
    assert.equal(weekdayNameFromIsoDate('2026-09-05'), 'saturday');
    assert.equal(utcWeekdayFromIsoDate('2026-09-05'), 6);
    assert.equal(dateAgreesWithExplicitWeekday('Monday Night Jam', '2026-09-05'), false);
    assert.equal(dateAgreesWithExplicitWeekday('Monday Night Jam', '2026-09-07'), true);
  });

  it('repairs Blue Room Monday Night Jam from publication Tuesday Sept 1', () => {
    const repaired = reconcileStatedDateWithWeekday({
      statedIso: '2026-09-05',
      text: 'MONDAY — Ernest Melton opens the Monday Night Jam, 7 pm',
      publishedAt: '2026-09-01T22:00:11.000Z',
    });
    assert.equal(repaired.isoDate, '2026-09-07');
    assert.equal(repaired.status, 'resolved');
    assert.match(repaired.reason ?? '', /replaced_contradictory_date/);
  });

  it('resolves weekday-only from the publication calendar, not server local getDay', () => {
    const iso = nextWeekdayIso(new Date('2026-09-01T22:00:11.000Z'), 1);
    assert.equal(iso, '2026-09-07');
  });

  it('preserves a contradictory stated year instead of silently picking another year', () => {
    const result = resolveWatchlistDate({
      text: 'this Monday, September 5 2026',
      publishedAt: '2026-09-01T22:00:11.000Z',
    });
    assert.equal(result.status, 'contradictory');
    assert.equal(result.isoDate, '2026-09-05');
  });

  it('resolves month/day in the current window without inventing a weekday', () => {
    const result = resolveWatchlistDate({
      text: 'Fish Friday lunch special Sept 4',
      now: new Date('2026-09-02T12:00:00.000Z'),
    });
    assert.equal(result.isoDate, '2026-09-04');
    assert.equal(result.status, 'resolved');
  });

  it('parses a slash date that already passed as that calendar day', () => {
    const result = resolveWatchlistDate({
      text: 'Episode 3 RESCHEDULED to 8/23/26',
      now: new Date('2026-09-02T12:00:00.000Z'),
    });
    assert.equal(result.isoDate, '2026-08-23');
    assert.equal(weekdayNameFromIsoDate(result.isoDate!), 'sunday');
  });

  it('crosses the year boundary for weekday-only Monday after Dec 30', () => {
    const iso = nextWeekdayIso(new Date('2026-12-30T18:00:00.000Z'), 1);
    assert.equal(iso, '2027-01-04');
  });

  it('does not fabricate a publication date', () => {
    const result = resolveWatchlistDate({
      text: 'Tonight only',
      publishedAt: null,
      now: new Date('2026-09-02T12:00:00.000Z'),
    });
    assert.equal(result.status, 'uncertain');
    assert.equal(result.isoDate, null);
  });
});
