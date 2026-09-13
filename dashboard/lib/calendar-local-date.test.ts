import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCalendarAllDayWhen,
  formatCalendarDayHeading,
  formatCalendarDayNavLabel,
  getCalendarItemDayKey,
  getLocalCalendarDay,
  isPriorCalendarDay,
  isPriorCalendarItemDay,
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

  it('formats the sticky nav label as weekday plus month and date', () => {
    assert.equal(formatCalendarDayNavLabel('2026-08-17', 'America/Chicago'), 'MONDAY · AUG 17');
    assert.equal(formatCalendarDayNavLabel('2026-08-18', 'America/Chicago'), 'TUESDAY · AUG 18');
  });
});

describe('all-day Calendar display (UTC date key, not Chicago shift)', () => {
  it('1. Woman of Influence-style all-day UTC midnight groups and labels Aug 28', () => {
    const item = { startAt: '2026-08-28T00:00:00.000Z', allDay: true };
    assert.equal(getCalendarItemDayKey(item), '2026-08-28');
    assert.equal(formatCalendarAllDayWhen(item.startAt), 'Fri, Aug 28');
  });

  it('2. Just Between Friends-style all-day groups and labels Sep 2', () => {
    const item = { startAt: '2026-09-02T00:00:00.000Z', allDay: true };
    assert.equal(getCalendarItemDayKey(item), '2026-09-02');
    assert.equal(formatCalendarAllDayWhen(item.startAt), 'Wed, Sep 2');
  });

  it('3. multi-day KHA Convention all-day start stays Sep 10, not Sep 9', () => {
    const item = { startAt: '2026-09-10T00:00:00.000Z', allDay: true };
    assert.equal(getCalendarItemDayKey(item), '2026-09-10');
    assert.equal(formatCalendarAllDayWhen(item.startAt), 'Thu, Sep 10');
  });

  it('4. timed OPCC-style event keeps Chicago-local day', () => {
    // 2026-08-21T08:00:00Z = Aug 21 3:00 AM CDT — same local calendar day.
    const item = { startAt: '2026-08-21T08:00:00.000Z', allDay: false };
    assert.equal(getCalendarItemDayKey(item), '2026-08-21');
    assert.equal(getCalendarItemDayKey(item), getLocalCalendarDay(item.startAt, 'America/Chicago'));
  });

  it('5. UTC midnight with allDay=false does not use all-day UTC-date semantics', () => {
    const item = { startAt: '2026-08-28T00:00:00.000Z', allDay: false };
    assert.equal(getCalendarItemDayKey(item), '2026-08-27');
    assert.notEqual(getCalendarItemDayKey(item), '2026-08-28');
  });

  it('6. Original Sin 9pm CT mistagged allDay=true groups under Saturday Sep 19', () => {
    const item = { startAt: '2026-09-20T02:00:00.000Z', allDay: true };
    assert.equal(getCalendarItemDayKey(item), '2026-09-19');
    assert.equal(formatCalendarDayHeading(getCalendarItemDayKey(item)), 'Saturday, September 19');
    assert.equal(formatCalendarAllDayWhen(item.startAt), 'Sat, Sep 19');
  });

  it('7. Original Sin timed allDay=false labels Sat Sep 19 local day', () => {
    const item = { startAt: '2026-09-20T02:00:00.000Z', allDay: false };
    assert.equal(getCalendarItemDayKey(item), '2026-09-19');
  });

  it('8. just before / after Chicago midnight', () => {
    // 2026-09-20 00:30 CDT = 2026-09-20T05:30:00Z → Sep 20
    assert.equal(getCalendarItemDayKey({ startAt: '2026-09-20T05:30:00.000Z', allDay: false }), '2026-09-20');
    // 2026-09-19 23:30 CDT = 2026-09-20T04:30:00Z → Sep 19
    assert.equal(getCalendarItemDayKey({ startAt: '2026-09-20T04:30:00.000Z', allDay: false }), '2026-09-19');
  });

  it('9. CST winter offset keeps local day', () => {
    // 2026-01-15 9pm CST = 2026-01-16T03:00:00Z
    assert.equal(getCalendarItemDayKey({ startAt: '2026-01-16T03:00:00.000Z', allDay: false }), '2026-01-15');
  });

  it('10. CDT summer offset keeps local day', () => {
    // 2026-07-15 9pm CDT = 2026-07-16T02:00:00Z
    assert.equal(getCalendarItemDayKey({ startAt: '2026-07-16T02:00:00.000Z', allDay: false }), '2026-07-15');
  });

  it('11. DST spring-forward boundary (2026-03-08)', () => {
    // 1:30 AM CDT does not exist; 3:30 AM CDT = 08:30Z on Mar 8
    assert.equal(getCalendarItemDayKey({ startAt: '2026-03-08T08:30:00.000Z', allDay: false }), '2026-03-08');
    // 11pm CST Mar 7 = 2026-03-08T05:00:00Z → Mar 7
    assert.equal(getCalendarItemDayKey({ startAt: '2026-03-08T05:00:00.000Z', allDay: false }), '2026-03-07');
  });

  it('12. DST fall-back boundary (2026-11-01)', () => {
    // 1:30 AM CST after fall-back = 07:30Z Nov 1
    assert.equal(getCalendarItemDayKey({ startAt: '2026-11-01T07:30:00.000Z', allDay: false }), '2026-11-01');
    // 11pm CDT Oct 31 = 2026-11-01T04:00:00Z → Oct 31
    assert.equal(getCalendarItemDayKey({ startAt: '2026-11-01T04:00:00.000Z', allDay: false }), '2026-10-31');
  });
});

describe('all-day Calendar past filter (same day key as grouping)', () => {
  const allDayAug28 = { startAt: '2026-08-28T00:00:00.000Z', allDay: true as const };

  it('1. all-day Aug 28 is NOT past when today is Aug 28', () => {
    // Noon UTC on Aug 28 ≈ morning Chicago — creator-local day is still Aug 28.
    assert.equal(isPriorCalendarItemDay(allDayAug28, '2026-08-28T17:00:00.000Z'), false);
  });

  it('2. all-day Aug 28 IS past when today is Aug 29', () => {
    assert.equal(isPriorCalendarItemDay(allDayAug28, '2026-08-29T17:00:00.000Z'), true);
  });

  it('3. all-day Aug 28 is future when today is Aug 27', () => {
    assert.equal(isPriorCalendarItemDay(allDayAug28, '2026-08-27T17:00:00.000Z'), false);
  });

  it('4. timed allDay=false keeps America/Chicago comparison', () => {
    // Aug 21 8pm CDT stored as Aug 22 01:00Z — Chicago day Aug 21.
    const timed = { startAt: '2026-08-22T01:00:00.000Z', allDay: false as const };
    assert.equal(isPriorCalendarItemDay(timed, '2026-08-22T17:00:00.000Z'), true); // today Aug 22 CT
    assert.equal(isPriorCalendarItemDay(timed, '2026-08-21T17:00:00.000Z'), false); // today Aug 21 CT
    assert.equal(
      isPriorCalendarItemDay(timed, '2026-08-22T17:00:00.000Z'),
      isPriorCalendarDay(timed.startAt, '2026-08-22T17:00:00.000Z', 'America/Chicago'),
    );
  });

  it('5. UTC midnight allDay=false still uses Chicago, not all-day UTC date', () => {
    const midnightTimed = { startAt: '2026-08-28T00:00:00.000Z', allDay: false as const };
    // Chicago day is Aug 27; vs today Aug 28 CT → past.
    assert.equal(isPriorCalendarItemDay(midnightTimed, '2026-08-28T17:00:00.000Z'), true);
    // Same instant as all-day would NOT be past on Aug 28 — proves branch differs.
    assert.equal(isPriorCalendarItemDay(allDayAug28, '2026-08-28T17:00:00.000Z'), false);
  });
});
