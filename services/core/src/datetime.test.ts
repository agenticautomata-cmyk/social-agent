import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocalCalendarDay,
  isPriorCreatorCalendarDay,
  isSameCreatorCalendarDay,
} from './datetime.js';
import { dueBucketFor } from './action-center/dates.js';

describe('creator calendar day helpers', () => {
  it('detects same vs prior creator-local days', () => {
    const now = new Date('2026-07-19T18:00:00.000Z'); // afternoon CT on Jul 19
    assert.equal(getLocalCalendarDay(now, 'America/Chicago'), '2026-07-19');
    assert.equal(isSameCreatorCalendarDay('2026-07-19T12:00:00.000Z', now, 'America/Chicago'), true);
    assert.equal(isPriorCreatorCalendarDay('2026-07-18T23:00:00.000Z', now, 'America/Chicago'), true);
    assert.equal(isSameCreatorCalendarDay('2026-07-18T23:00:00.000Z', now, 'America/Chicago'), false);
  });
});

describe('dueBucketFor creator timezone', () => {
  it('classifies overdue relative to creator calendar day, not server midnight', () => {
    // 1am UTC on Jul 20 is still Jul 19 evening in America/Chicago
    const now = new Date('2026-07-20T01:00:00.000Z');
    const dueYesterdayCt = '2026-07-18T17:00:00.000Z';
    const dueTodayCt = '2026-07-19T20:00:00.000Z';
    const dueTomorrowCt = '2026-07-20T17:00:00.000Z';

    assert.equal(dueBucketFor(dueYesterdayCt, now), 'overdue');
    assert.equal(dueBucketFor(dueTodayCt, now), 'due_today');
    assert.equal(dueBucketFor(dueTomorrowCt, now), 'due_this_week');
  });
});
