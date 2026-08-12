import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateTemporalState,
  isTemporallyCurrent,
  resolveEffectiveEnd,
} from './temporal-state.js';
import { computeLifecycleStatus } from './lifecycle.js';
import {
  hasStaleCurrentnessClaim,
  sanitizeStaleTemporalProse,
} from './stale-temporal-prose.js';

const CHICAGO = 'America/Chicago';
const NOW_AUG_10 = new Date('2026-08-10T17:00:00.000Z'); // ~noon CDT

describe('evaluateTemporalState', () => {
  it('marks event happening today as current (date-only Chicago day)', () => {
    const result = evaluateTemporalState({
      startsAt: new Date('2026-08-10T00:00:00.000Z'),
      endsAt: null,
      timezone: CHICAGO,
      now: NOW_AUG_10,
    });
    assert.equal(result.state, 'current');
    assert.equal(result.dateOnly, true);
  });

  it('marks event starting tomorrow as upcoming', () => {
    const result = evaluateTemporalState({
      startsAt: new Date('2026-08-11T00:00:00.000Z'),
      endsAt: null,
      timezone: CHICAGO,
      now: NOW_AUG_10,
    });
    assert.equal(result.state, 'upcoming');
  });

  it('marks event ended yesterday as expired', () => {
    const result = evaluateTemporalState({
      startsAt: new Date('2026-08-09T00:00:00.000Z'),
      endsAt: null,
      timezone: CHICAGO,
      now: NOW_AUG_10,
    });
    assert.equal(result.state, 'expired');
  });

  it('prefers explicit end timestamp over start', () => {
    const result = evaluateTemporalState({
      startsAt: new Date('2026-08-08T15:00:00.000Z'),
      endsAt: new Date('2026-08-09T22:00:00.000Z'),
      timezone: CHICAGO,
      now: NOW_AUG_10,
    });
    assert.equal(result.state, 'expired');
    const { effectiveEnd } = resolveEffectiveEnd(
      new Date('2026-08-08T15:00:00.000Z'),
      new Date('2026-08-09T22:00:00.000Z'),
      CHICAGO,
    );
    assert.equal(effectiveEnd?.toISOString(), '2026-08-09T22:00:00.000Z');
  });

  it('uses America/Chicago day boundary for date-only KC events', () => {
    // Aug 9 date-only ends at end of Aug 9 Chicago — still current late evening CDT Aug 9
    const lateAug9Cdt = new Date('2026-08-10T04:30:00.000Z'); // 11:30pm CDT Aug 9
    assert.equal(
      evaluateTemporalState({
        startsAt: new Date('2026-08-09T00:00:00.000Z'),
        timezone: CHICAGO,
        now: lateAug9Cdt,
      }).state,
      'current',
    );
    // Immediately after Chicago midnight Aug 10 → expired
    const earlyAug10Cdt = new Date('2026-08-10T05:05:00.000Z'); // 12:05am CDT
    assert.equal(
      evaluateTemporalState({
        startsAt: new Date('2026-08-09T00:00:00.000Z'),
        timezone: CHICAGO,
        now: earlyAug10Cdt,
      }).state,
      'expired',
    );
  });

  it('keeps future events current/upcoming', () => {
    assert.equal(
      isTemporallyCurrent({
        startsAt: new Date('2026-08-20T00:00:00.000Z'),
        now: NOW_AUG_10,
      }),
      true,
    );
  });

  it('does not falsely expire unknown/no-date rows', () => {
    const result = evaluateTemporalState({
      startsAt: null,
      endsAt: null,
      now: NOW_AUG_10,
    });
    assert.equal(result.state, 'unknown');
    assert.equal(computeLifecycleStatus({ title: 'Local thrift restock' }, NOW_AUG_10), 'active');
  });
});

describe('Style Encore regression fixture', () => {
  it('Aug 8–9 event is expired on Aug 10 Chicago and prose is rewritten', () => {
    const temporal = evaluateTemporalState({
      startsAt: new Date('2026-08-08T00:00:00.000Z'),
      endsAt: new Date('2026-08-09T00:00:00.000Z'),
      timezone: CHICAGO,
      now: NOW_AUG_10,
    });
    assert.equal(temporal.state, 'expired');
    assert.equal(
      computeLifecycleStatus(
        {
          title: 'Style Encore Overland Park store happening',
          eventStartsAt: '2026-08-08T00:00:00.000Z',
          eventEndsAt: '2026-08-09T00:00:00.000Z',
        },
        NOW_AUG_10,
      ),
      'expired',
    );

    const prose =
      'Style Encore Overland Park. The next event is scheduled for August 8th and 9th, 2026. No verified current event or sale was confirmed.';
    assert.equal(
      hasStaleCurrentnessClaim(prose, {
        startsAt: '2026-08-08T00:00:00.000Z',
        endsAt: '2026-08-09T00:00:00.000Z',
        now: NOW_AUG_10,
      }),
      true,
    );
    const sanitized = sanitizeStaleTemporalProse({
      text: prose,
      startsAt: '2026-08-08T00:00:00.000Z',
      endsAt: '2026-08-09T00:00:00.000Z',
      now: NOW_AUG_10,
    });
    assert.equal(sanitized.changed, true);
    assert.match(sanitized.text, /worth watching|historical|previous|has run/i);
    assert.doesNotMatch(sanitized.text, /\bnext event\b/i);
  });

  it('undated Style Encore script with past next-event claim is treated as stale', () => {
    const prose =
      'The next event is scheduled for August 8th and 9th, 2026. No verified current event or sale was confirmed.';
    assert.equal(hasStaleCurrentnessClaim(prose, { now: NOW_AUG_10 }), true);
    const sanitized = sanitizeStaleTemporalProse({ text: prose, now: NOW_AUG_10 });
    assert.doesNotMatch(sanitized.text, /\bnext event\b/i);
    assert.match(sanitized.text, /worth watching/i);
  });
});
