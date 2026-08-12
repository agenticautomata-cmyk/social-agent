import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSourceMute,
  getSourceMutePolicy,
  withSourceMutePolicy,
} from './mute-policy.js';

describe('source mute policy', () => {
  it('defaults to none when unset', () => {
    assert.equal(getSourceMutePolicy(undefined), 'none');
    assert.equal(getSourceMutePolicy({}), 'none');
    assert.equal(getSourceMutePolicy({ mutePolicy: 'something_else' }), 'none');
  });

  it('reads a persisted always_ignore policy', () => {
    assert.equal(getSourceMutePolicy({ mutePolicy: 'always_ignore' }), 'always_ignore');
  });

  it('withSourceMutePolicy preserves existing config keys', () => {
    const next = withSourceMutePolicy({ calendarUrl: 'https://kclibrary.org/calendar', limit: 30 }, 'always_ignore');
    assert.equal(next.calendarUrl, 'https://kclibrary.org/calendar');
    assert.equal(next.limit, 30);
    assert.equal(next.mutePolicy, 'always_ignore');
    assert.ok(typeof next.mutePolicyUpdatedAt === 'string');
  });

  it('does not mute when policy is none', () => {
    const decision = evaluateSourceMute({}, 'Family Storytime at Plaza Branch');
    assert.equal(decision.muted, false);
  });

  it('mutes routine items when policy is always_ignore', () => {
    const decision = evaluateSourceMute({ mutePolicy: 'always_ignore' }, 'Family Storytime at Plaza Branch');
    assert.equal(decision.muted, true);
    assert.equal(decision.reason, 'source_policy:always_ignore');
  });

  it('lets genuinely major events through even when the source is muted', () => {
    const decision = evaluateSourceMute(
      { mutePolicy: 'always_ignore' },
      'Nationally touring celebrity author visit at Central Library',
    );
    assert.equal(decision.muted, false);
    assert.equal(decision.reason, 'source_policy:always_ignore_exception_major_event');
  });
});
