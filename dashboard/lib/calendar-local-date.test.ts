import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCalendarDayHeading,
  getLocalCalendarDay,
  isPriorCalendarDay,
  isSameCalendarDay,
} from './calendar-local-date';

describe('calendar-local-date', () => {
  it('buckets a late-evening Central-time event on its Central calendar day, not UTC', () => {
    // 8:00 PM CDT on July 25 is stored as 2026-07-26T01:00:00.000Z (UTC is 5h ahead in summer).
    const storedUtc = '2026-07-26T01:00:00.000Z';
    assert.equal(getLocalCalendarDay(storedUtc, 'America/Chicago'), '2026-07-25');
  });

  it('treats an event on a prior Central calendar day as past even near a UTC day boundary', () => {
    const storedUtc = '2026-07-26T01:00:00.000Z'; // July 25, 8pm CDT
    const now = '2026-08-01T14:00:00.000Z'; // Aug 1, 9am CDT
    assert.equal(isPriorCalendarDay(storedUtc, now, 'America/Chicago'), true);
  });

  it('does not treat today as prior', () => {
    const now = '2026-08-01T14:00:00.000Z';
    const laterToday = '2026-08-01T23:00:00.000Z';
    assert.equal(isPriorCalendarDay(laterToday, now, 'America/Chicago'), false);
    assert.equal(isSameCalendarDay(laterToday, now, 'America/Chicago'), true);
  });

  it('formats the day heading using the Central calendar day, not the UTC day', () => {
    // getLocalCalendarDay for the July 25 8pm CDT event yields "2026-07-25".
    const heading = formatCalendarDayHeading('2026-07-25', 'America/Chicago');
    assert.equal(heading, 'Saturday, July 25');
  });
});
