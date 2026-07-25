import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadActiveSkippedRecords } from './index.js';

describe('loadActiveSkippedRecords', () => {
  it('returns rows without throwing when querying snooze filters', async () => {
    const rows = await loadActiveSkippedRecords();
    assert.ok(Array.isArray(rows));
  });
});
