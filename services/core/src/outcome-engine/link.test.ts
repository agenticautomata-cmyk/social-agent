import assert from 'node:assert/strict';
import test from 'node:test';

function classifyOutcome(score: number | null, hasPost: boolean, hasShoot: boolean) {
  if (score == null) {
    if (!hasShoot && !hasPost) return 'insufficient_data';
    if (hasShoot && !hasPost) return 'failed_execution';
    return 'insufficient_data';
  }
  if (score >= 0.8) return 'high_value';
  if (score >= 0.6) return 'good';
  if (score >= 0.4) return 'neutral';
  if (score >= 0.2) return 'weak';
  return 'failed_execution';
}

test('outcome classification distinguishes non-execution from poor performance', () => {
  assert.equal(classifyOutcome(null, false, false), 'insufficient_data');
  assert.equal(classifyOutcome(null, false, true), 'failed_execution');
  assert.equal(classifyOutcome(0.85, true, true), 'high_value');
  assert.equal(classifyOutcome(0.15, true, true), 'failed_execution');
});
