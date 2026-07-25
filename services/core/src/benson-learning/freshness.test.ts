import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTimelyForLearning,
  parseExplicitDateInText,
  textReferencesExpiredDate,
} from './freshness.js';

describe('learning freshness', () => {
  const july25 = new Date('2026-07-25T12:00:00.000Z');

  it('parses July 16 from text relative to reference date', () => {
    const parsed = parseExplicitDateInText('Grand Opening on July 16 in Belton', july25);
    assert.ok(parsed);
    assert.equal(parsed!.getUTCMonth(), 6);
    assert.equal(parsed!.getUTCDate(), 16);
  });

  it('flags Savers July 16 grand opening as expired on July 25', () => {
    const text = 'Consider filming the Savers Thrift Store Grand Opening in Belton, MO, on July 16';
    assert.ok(textReferencesExpiredDate(text, july25));
  });

  it('excludes expired opening opportunities from timely learning signals', () => {
    const timely = isTimelyForLearning({
      title: 'Savers Thrift Store Grand Opening — Belton',
      eventStartsAt: '2026-07-16T15:00:00.000Z',
      category: 'retail_opening',
      now: july25,
    });
    assert.equal(timely, false);
  });

  it('keeps future openings timely', () => {
    const timely = isTimelyForLearning({
      title: 'New boutique opening weekend',
      eventStartsAt: '2026-08-02T15:00:00.000Z',
      category: 'retail_opening',
      now: july25,
    });
    assert.equal(timely, true);
  });
});
