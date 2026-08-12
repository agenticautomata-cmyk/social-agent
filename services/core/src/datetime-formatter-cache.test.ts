import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  clearDateTimeFormatCacheForTests,
  getDateTimeFormatCacheSizeForTests,
  getLocalCalendarDay,
  localHourInTimezone,
  timezoneShortLabel,
} from './datetime.js';
import { evaluateTemporalState } from './creator-agent/temporal-state.js';
import { sanitizeStaleTemporalProse } from './creator-agent/stale-temporal-prose.js';

const CHICAGO = 'America/Chicago';

describe('Intl.DateTimeFormat cache', () => {
  beforeEach(() => {
    clearDateTimeFormatCacheForTests();
  });

  it('reuses formatter for repeated getLocalCalendarDay calls (same timezone)', () => {
    const date = new Date('2026-08-10T17:00:00.000Z');
    assert.equal(getDateTimeFormatCacheSizeForTests(), 0);
    getLocalCalendarDay(date, CHICAGO);
    assert.equal(getDateTimeFormatCacheSizeForTests(), 1);
    for (let i = 0; i < 100; i += 1) {
      getLocalCalendarDay(new Date(date.getTime() + i * 3_600_000), CHICAGO);
    }
    assert.equal(getDateTimeFormatCacheSizeForTests(), 1);
  });

  it('America/Chicago normal date', () => {
    const d = new Date('2026-07-19T18:00:00.000Z');
    assert.equal(getLocalCalendarDay(d, CHICAGO), '2026-07-19');
  });

  it('UTC calendar day', () => {
    const d = new Date('2026-08-10T23:30:00.000Z');
    assert.equal(getLocalCalendarDay(d, 'UTC'), '2026-08-10');
  });

  it('America/New_York differs from Chicago near midnight UTC', () => {
    const d = new Date('2026-01-15T04:30:00.000Z');
    assert.equal(getLocalCalendarDay(d, 'America/New_York'), '2026-01-14');
    assert.equal(getLocalCalendarDay(d, CHICAGO), '2026-01-14');
  });

  it('DST spring-forward boundary (America/Chicago)', () => {
    const before = new Date('2026-03-08T07:59:00.000Z');
    const after = new Date('2026-03-08T09:00:00.000Z');
    assert.equal(getLocalCalendarDay(before, CHICAGO), '2026-03-08');
    assert.equal(getLocalCalendarDay(after, CHICAGO), '2026-03-08');
    assert.equal(localHourInTimezone(before, CHICAGO), 1);
    assert.equal(localHourInTimezone(after, CHICAGO), 4);
  });

  it('DST fall-back boundary (America/Chicago)', () => {
    const firstPass = new Date('2026-11-01T06:30:00.000Z');
    const secondPass = new Date('2026-11-01T07:30:00.000Z');
    assert.equal(getLocalCalendarDay(firstPass, CHICAGO), '2026-11-01');
    assert.equal(getLocalCalendarDay(secondPass, CHICAGO), '2026-11-01');
  });

  it('invalid timezone throws (unchanged behavior)', () => {
    assert.throws(
      () => getLocalCalendarDay(new Date(), 'Not/A_Real_Zone'),
      (err: unknown) => err instanceof RangeError,
    );
  });

  it('timezoneShortLabel returns stable labels for Chicago', () => {
    const winter = new Date('2026-01-15T18:00:00.000Z');
    const summer = new Date('2026-07-15T18:00:00.000Z');
    assert.match(timezoneShortLabel(CHICAGO, winter), /CST|CDT/);
    assert.match(timezoneShortLabel(CHICAGO, summer), /CST|CDT/);
  });

  it('evaluateTemporalState unchanged with cache', () => {
    const now = new Date('2026-08-10T17:00:00.000Z');
    const result = evaluateTemporalState({
      startsAt: new Date('2026-08-10T00:00:00.000Z'),
      endsAt: null,
      timezone: CHICAGO,
      now,
    });
    assert.equal(result.state, 'current');
    assert.equal(result.dateOnly, true);
  });

  it('sanitizeStaleTemporalProse unchanged with cache', () => {
    const sanitized = sanitizeStaleTemporalProse({
      text: 'The next event is scheduled for August 9, 2026.',
      startsAt: new Date('2026-08-09T00:00:00.000Z'),
      endsAt: null,
      timezone: CHICAGO,
      now: new Date('2026-08-10T17:00:00.000Z'),
    });
    assert.equal(sanitized.changed, true);
    assert.match(sanitized.text, /worth watching|previous|historical|has run/i);
  });
});

describe('cache formatter keys', () => {
  beforeEach(() => {
    clearDateTimeFormatCacheForTests();
  });

  it('creates separate entries per timezone option set', () => {
    const d = new Date('2026-08-10T12:00:00.000Z');
    getLocalCalendarDay(d, CHICAGO);
    getLocalCalendarDay(d, 'UTC');
    getLocalCalendarDay(d, 'America/New_York');
    assert.equal(getDateTimeFormatCacheSizeForTests(), 3);
  });
});
