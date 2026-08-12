import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignPriority } from './priorities.js';

describe('assignPriority — simulated pitches must never be CRITICAL', () => {
  it('caps a simulated overdue follow-up at suggested, not critical', () => {
    const priority = assignPriority({
      section: 'pending_follow_ups',
      dueBucket: 'overdue',
      meta: { simulated: true, sendProvenance: 'simulated' },
    });
    assert.equal(priority, 'suggested');
  });

  it('caps an unknown-provenance overdue follow-up at suggested', () => {
    const priority = assignPriority({
      section: 'pending_follow_ups',
      dueBucket: 'overdue',
      meta: { simulated: true, sendProvenance: 'unknown' },
    });
    assert.equal(priority, 'suggested');
  });

  it('still allows a real, verified overdue follow-up to be critical', () => {
    const priority = assignPriority({
      section: 'pending_follow_ups',
      dueBucket: 'overdue',
      meta: { simulated: false, sendProvenance: 'real' },
    });
    assert.equal(priority, 'critical');
  });

  it('does not affect non-follow-up sections with the simulated flag', () => {
    const priority = assignPriority({
      section: 'sponsor_opportunities_needing_updates',
      dueBucket: 'overdue',
      meta: { simulated: true },
    });
    assert.equal(priority, 'critical');
  });

  it('still respects pinned planner priority 0 as critical', () => {
    const priority = assignPriority({
      section: 'upcoming_planned_content',
      dueBucket: 'none',
      meta: { plannerPriority: 0 },
    });
    assert.equal(priority, 'critical');
  });
});
