import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRunCompactExtractRetry } from './compact-extract.js';
import { ocrTextHasEventSignals } from './token-metrics.js';

describe('shouldRunCompactExtractRetry', () => {
  const eventBody =
    'Email sent: 2026-07-15\nJazz at the Blue Room Friday July 18 doors 7pm Kansas City MO tickets on sale';

  it('runs once for empty items when deterministic event signals exist', () => {
    assert.equal(
      shouldRunCompactExtractRetry({
        parseOk: true,
        itemCount: 0,
        hasEventSignals: ocrTextHasEventSignals(eventBody),
        retryAlreadyUsed: false,
        quotaBlocked: false,
      }),
      true,
    );
  });

  it('does not run when retry already used', () => {
    assert.equal(
      shouldRunCompactExtractRetry({
        parseOk: true,
        itemCount: 0,
        hasEventSignals: true,
        retryAlreadyUsed: true,
        quotaBlocked: false,
      }),
      false,
    );
  });

  it('does not run on quota errors', () => {
    assert.equal(
      shouldRunCompactExtractRetry({
        parseOk: true,
        itemCount: 0,
        hasEventSignals: true,
        retryAlreadyUsed: false,
        quotaBlocked: true,
      }),
      false,
    );
  });

  it('does not run without deterministic event signals', () => {
    assert.equal(
      shouldRunCompactExtractRetry({
        parseOk: true,
        itemCount: 0,
        hasEventSignals: false,
        retryAlreadyUsed: false,
        quotaBlocked: false,
      }),
      false,
    );
  });

  it('does not run when items were extracted successfully', () => {
    assert.equal(
      shouldRunCompactExtractRetry({
        parseOk: true,
        itemCount: 2,
        hasEventSignals: true,
        retryAlreadyUsed: false,
        quotaBlocked: false,
      }),
      false,
    );
  });
});
