import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeExtractedEventDate } from './date-normalize.js';

const SENT = '2026-07-15T10:00:00Z';
const OLD_EMAIL_SENT = '2026-03-10T14:30:00.000Z';
const REPROCESS_LATER = '2026-07-31T22:00:00.000Z';

describe('normalizeExtractedEventDate', () => {
  it('rejects explicit stale absolute ISO dates', () => {
    const result = normalizeExtractedEventDate({
      rawDate: '2023-08-12',
      emailSentAt: SENT,
    });
    assert.equal(result.status, 'rejected_stale_date');
    assert.equal(result.isoDate, null);
  });

  it('rejects August 12, 2023 prose with explicit year', () => {
    const result = normalizeExtractedEventDate({
      rawDate: 'August 12, 2023',
      emailSentAt: SENT,
    });
    assert.equal(result.status, 'rejected_stale_date');
  });

  it('infers nearest future year for month/day without year', () => {
    const result = normalizeExtractedEventDate({
      rawDate: 'August 12',
      emailSentAt: SENT,
    });
    assert.equal(result.status, 'resolved');
    assert.equal(result.isoDate, '2026-08-12');
  });

  it('anchors relative weekday to email sent date', () => {
    const result = normalizeExtractedEventDate({
      rawDate: null,
      emailSentAt: '2026-07-15T10:00:00Z',
      sourceText: 'Live music this Saturday at 8pm',
    });
    assert.equal(result.status, 'resolved');
    assert.equal(result.isoDate, '2026-07-18');
  });

  it('rolls inferred month/day across December/January boundary', () => {
    const result = normalizeExtractedEventDate({
      rawDate: 'January 10',
      emailSentAt: '2026-12-20T12:00:00Z',
    });
    assert.equal(result.status, 'resolved');
    assert.equal(result.isoDate, '2027-01-10');
  });

  it('allows annual recurrence only with explicit proof', () => {
    const result = normalizeExtractedEventDate({
      rawDate: 'August 12, 2023',
      emailSentAt: SENT,
      hasRecurrenceProof: true,
      hasStrongCurrentEventEvidence: true,
      sourceText: 'Annual KC Jazz Festival returns August 12',
    });
    assert.equal(result.status, 'resolved');
    assert.match(result.isoDate ?? '', /^2026-08-12$/);
  });

  it('does not roll annual date without recurrence proof', () => {
    const result = normalizeExtractedEventDate({
      rawDate: 'August 12, 2023',
      emailSentAt: SENT,
      hasRecurrenceProof: false,
      sourceText: 'August 12 concert',
    });
    assert.equal(result.status, 'rejected_stale_date');
  });

  it('corrects stale LLM ISO when source text has a future ISO', () => {
    const result = normalizeExtractedEventDate({
      rawDate: '2023-08-15',
      emailSentAt: SENT,
      sourceText: 'Jazz at the Blue Room Friday 2026-08-15 at 8:00 PM Kansas City MO',
    });
    assert.equal(result.status, 'resolved');
    assert.equal(result.isoDate, '2026-08-15');
    assert.equal(result.detail, 'corrected_from_source_text_iso');
  });

  it('marks stale explicit dates as needs_verification with strong current evidence', () => {
    const result = normalizeExtractedEventDate({
      rawDate: '2023-08-12',
      emailSentAt: SENT,
      hasStrongCurrentEventEvidence: true,
      sourceText: 'Just announced — tickets on sale now',
    });
    assert.equal(result.status, 'needs_verification');
    assert.equal(result.isoDate, '2023-08-12');
  });
});

describe('email timestamp anchoring stability', () => {
  it('resolves relative phrases from email sent time, not reprocess time', () => {
    const fromEmail = normalizeExtractedEventDate({
      rawDate: null,
      emailSentAt: OLD_EMAIL_SENT,
      sourceText: 'Poetry night this Friday at 7pm',
    });
    assert.equal(fromEmail.status, 'resolved');
    assert.equal(fromEmail.isoDate, '2026-03-13');

    const ifWallClock = normalizeExtractedEventDate({
      rawDate: null,
      emailSentAt: REPROCESS_LATER,
      sourceText: 'Poetry night this Friday at 7pm',
    });
    assert.notEqual(ifWallClock.isoDate, fromEmail.isoDate);
  });

  it('produces identical dates when the same old email is reprocessed later', () => {
    const inputs = [
      { rawDate: 'August 12', emailSentAt: OLD_EMAIL_SENT },
      { rawDate: null, emailSentAt: OLD_EMAIL_SENT, sourceText: 'Live music this Saturday' },
      { rawDate: null, emailSentAt: OLD_EMAIL_SENT, sourceText: 'Brunch tomorrow at 11' },
    ] as const;

    for (const input of inputs) {
      const first = normalizeExtractedEventDate(input);
      const second = normalizeExtractedEventDate(input);
      assert.equal(second.isoDate, first.isoDate, JSON.stringify(input));
      assert.equal(second.status, first.status, JSON.stringify(input));
    }
  });
});
