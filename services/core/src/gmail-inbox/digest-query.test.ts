import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigestUnreadQuery, digestMessageCap } from './digest-query.js';

describe('digest query helpers', () => {
  it('includes promotions and a lookback window by default', () => {
    const query = buildDigestUnreadQuery();
    assert.match(query, /newer_than:\d+d/);
    assert.match(query, /category:promotions/);
    assert.match(query, /category:primary/);
    assert.doesNotMatch(query, /category:spam/);
  });

  it('can omit promotions when requested', () => {
    const query = buildDigestUnreadQuery({ includePromotions: false, lookbackDays: 7 });
    assert.match(query, /newer_than:7d/);
    assert.doesNotMatch(query, /promotions/);
  });

  it('exposes a digest message cap', () => {
    assert.ok(digestMessageCap() >= 25);
  });
});
