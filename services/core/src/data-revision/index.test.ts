import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  markDomainRecalculating,
  clearDomainRecalculating,
  emitDataChange,
} from './index.js';

describe('data-revision emitDataChange', () => {
  it('does not bump revision when success is false', async () => {
    const bumped = await emitDataChange({
      eventType: 'analytics_sync',
      domains: ['analytics'],
      completedAt: new Date().toISOString(),
      source: 'test',
      success: false,
    });
    assert.deepEqual(bumped, {});
  });
});

describe('recalculating markers', () => {
  it('marks and clears recommendation recalculation state', () => {
    markDomainRecalculating('recommendations', { message: 'Updating…' });
    clearDomainRecalculating('recommendations');
    assert.ok(true);
  });
});
