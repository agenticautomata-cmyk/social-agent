import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectConflicts } from './sync.js';

describe('detectConflicts', () => {
  it('detects overlapping busy blocks', () => {
    const start = new Date('2026-08-01T14:00:00.000Z');
    const end = new Date('2026-08-01T15:00:00.000Z');
    const conflicts = detectConflicts(start, end, [
      { start: '2026-08-01T13:30:00.000Z', end: '2026-08-01T14:30:00.000Z' },
    ]);
    assert.equal(conflicts.length, 1);
  });

  it('ignores non-overlapping blocks', () => {
    const start = new Date('2026-08-01T14:00:00.000Z');
    const end = new Date('2026-08-01T15:00:00.000Z');
    const conflicts = detectConflicts(start, end, [
      { start: '2026-08-01T16:00:00.000Z', end: '2026-08-01T17:00:00.000Z' },
    ]);
    assert.equal(conflicts.length, 0);
  });
});
