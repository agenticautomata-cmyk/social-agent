import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stableBatchEmailSentAt } from './batch-email-anchor.js';

describe('stableBatchEmailSentAt', () => {
  it('is deterministic per gmail message id', () => {
    const id = '19fb5424ad95b46a';
    assert.equal(stableBatchEmailSentAt(id), stableBatchEmailSentAt(id));
  });

  it('is stable across repeated batch runs', () => {
    const first = stableBatchEmailSentAt('19fb5424ad95b46a');
    const second = stableBatchEmailSentAt('19fb5424ad95b46a');
    assert.equal(first, second);
    assert.match(first, /^\d{4}-\d{2}-\d{2}T/);
  });
});
