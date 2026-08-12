import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSurfaceContactFollowUp } from './collect.js';

describe('shouldSurfaceContactFollowUp — never generate a follow-up from a simulation', () => {
  it('surfaces a follow-up only for real (actually sent) outreach', () => {
    assert.equal(shouldSurfaceContactFollowUp('real'), true);
  });

  it('never surfaces a follow-up for a simulated/demo send', () => {
    assert.equal(shouldSurfaceContactFollowUp('simulated'), false);
  });

  it('never surfaces a follow-up when provenance cannot be established', () => {
    assert.equal(shouldSurfaceContactFollowUp('unknown'), false);
  });
});
