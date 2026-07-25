import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INGEST_RETENTION_DAYS_PAST_EVENT } from './retention.js';
import { isAncientEventDate } from './expire-sweep.js';

describe('expired event sweep helpers', () => {
  const now = new Date('2026-07-19T15:00:00.000Z');

  it('flags Mecum 2019 as ancient', () => {
    assert.equal(
      isAncientEventDate(new Date('2019-12-01T00:00:00.000Z'), null, now),
      true,
    );
  });

  it('keeps events within the retention window', () => {
    assert.equal(
      isAncientEventDate(new Date('2026-07-15T00:00:00.000Z'), null, now),
      false,
    );
  });

  it('uses event end when present', () => {
    assert.equal(
      isAncientEventDate(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-18T00:00:00.000Z'),
        now,
      ),
      false,
    );
    assert.equal(
      isAncientEventDate(
        new Date('2019-12-01T00:00:00.000Z'),
        new Date('2019-12-05T00:00:00.000Z'),
        now,
        INGEST_RETENTION_DAYS_PAST_EVENT,
      ),
      true,
    );
  });

  it('does not treat undated rows as ancient', () => {
    assert.equal(isAncientEventDate(null, null, now), false);
  });
});
