import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  CALENDAR_PROJECTION_CACHE_MAX,
  CALENDAR_PROJECTION_TTL_MS,
  calendarProjectionReadPlan,
  calendarProjectionWindowKey,
  getCalendarProjectionCacheSize,
  isCalendarProjectionFresh,
  markCalendarProjectionStale,
  noteCalendarProjectionReconciled,
  resetCalendarProjectionFreshnessForTests,
  setCalendarProjectionInflight,
} from './projection-freshness.js';

describe('calendarProjectionWindowKey', () => {
  it('collapses tiny timestamp differences onto Chicago calendar days', () => {
    const a = new Date('2026-08-13T19:44:47.000Z');
    const b = new Date('2026-08-13T19:44:47.900Z');
    const toA = new Date('2026-10-13T19:44:47.000Z');
    const toB = new Date('2026-10-13T19:45:12.000Z');
    assert.equal(calendarProjectionWindowKey(a, toA), calendarProjectionWindowKey(b, toB));
  });

  it('splits windows that fall on different Chicago days', () => {
    const from = new Date('2026-08-14T04:30:00.000Z');
    const toSame = new Date('2026-10-13T05:00:00.000Z');
    const toNext = new Date('2026-10-14T05:00:00.000Z');
    assert.notEqual(calendarProjectionWindowKey(from, toSame), calendarProjectionWindowKey(from, toNext));
  });
});

describe('calendar projection freshness cache', () => {
  beforeEach(() => {
    resetCalendarProjectionFreshnessForTests();
  });

  it('treats an unseen window with no rows as cold await', () => {
    assert.equal(
      calendarProjectionReadPlan({ windowKey: '2026-08-13|2026-10-13', hasProjectedRows: false }),
      'awaited',
    );
  });

  it('background-refreshes a populated window after restart (cache empty)', () => {
    assert.equal(
      calendarProjectionReadPlan({ windowKey: '2026-08-13|2026-10-13', hasProjectedRows: true }),
      'background',
    );
  });

  it('skips reconcile while the window is fresh', () => {
    const key = '2026-08-13|2026-10-13';
    const now = Date.now();
    noteCalendarProjectionReconciled(key, now);
    assert.equal(isCalendarProjectionFresh(key, now + 1_000), true);
    assert.equal(
      calendarProjectionReadPlan({ windowKey: key, hasProjectedRows: true, now: now + 1_000 }),
      'fresh',
    );
  });

  it('goes stale after the TTL', () => {
    const key = '2026-08-13|2026-10-13';
    const now = Date.now();
    noteCalendarProjectionReconciled(key, now);
    assert.equal(
      calendarProjectionReadPlan({
        windowKey: key,
        hasProjectedRows: true,
        now: now + CALENDAR_PROJECTION_TTL_MS + 1,
      }),
      'background',
    );
  });

  it('markCalendarProjectionStale forces the next read off the fresh path', () => {
    const key = '2026-08-13|2026-10-13';
    noteCalendarProjectionReconciled(key);
    markCalendarProjectionStale(key);
    assert.equal(
      calendarProjectionReadPlan({ windowKey: key, hasProjectedRows: true }),
      'background',
    );
  });

  it('bounds the in-memory window map', () => {
    for (let i = 0; i < CALENDAR_PROJECTION_CACHE_MAX + 8; i += 1) {
      noteCalendarProjectionReconciled(`k${i}`);
    }
    assert.ok(getCalendarProjectionCacheSize() <= CALENDAR_PROJECTION_CACHE_MAX);
  });

  it('joins an in-flight cold projection instead of returning empty', () => {
    const key = '2026-08-13|2026-10-13';
    setCalendarProjectionInflight(key, Promise.resolve());
    assert.equal(
      calendarProjectionReadPlan({ windowKey: key, hasProjectedRows: false }),
      'awaited',
    );
    assert.equal(
      calendarProjectionReadPlan({ windowKey: key, hasProjectedRows: true }),
      'background',
    );
  });
});
