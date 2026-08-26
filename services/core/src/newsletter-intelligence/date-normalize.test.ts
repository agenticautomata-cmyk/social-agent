import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeExtractedEventDate, recoverDatesNearTitle } from './date-normalize.js';

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

describe('recoverDatesNearTitle', () => {
  const SENT = '2026-08-13T15:00:00Z';

  it('recovers independent dates from a multi-event zoo newsletter window', () => {
    const body = `
      Melon Summer Smash Coming Saturday!
      Watch the animals enjoy melon enrichment on Saturday, August 15 from 9:30 am to 5 pm.

      Brew at the Zoo returns Saturday, October 10 from 4 to 8 pm.

      A Pirate's Feast at GloWild runs September 12 through October 24.
    `;
    const melon = recoverDatesNearTitle({
      title: 'Melon Summer Smash',
      bodyText: body,
      emailSentAt: SENT,
    });
    assert.equal(melon.startDate, '2026-08-15');

    const brew = recoverDatesNearTitle({
      title: 'Brew at the Zoo',
      bodyText: body,
      emailSentAt: SENT,
    });
    assert.equal(brew.startDate, '2026-10-10');

    const feast = recoverDatesNearTitle({
      title: "A Pirate's Feast at GloWild",
      bodyText: body,
      emailSentAt: SENT,
    });
    assert.equal(feast.startDate, '2026-09-12');
    assert.equal(feast.endDate, '2026-10-24');

    const feastDash = recoverDatesNearTitle({
      title: "A Pirate's Feast at GloWild",
      bodyText:
        "A Pirate's Feast at GloWild. On Fridays and Saturdays from September 12 - October 24 (excluding October 10). Book now through August 24 and save $6.",
      emailSentAt: SENT,
    });
    assert.equal(feastDash.startDate, '2026-09-12');
    assert.equal(feastDash.endDate, '2026-10-24');
  });

  it('recovers a dated in-person sale window from weekday slash dates', () => {
    const sale = recoverDatesNearTitle({
      title: 'ESTATE JEWELRY DEBUT',
      bodyText:
        'of ESTATE JEWELRY during these selected dates & times: Monday 8/10, 11 am - 2 pm Thursday 8/13, 11 am - 2 pm Friday 8/14, 11 am - 2 pm Saturday 8/15, 11 am - 2 pm',
      emailSentAt: '2026-08-09T11:53:09Z',
    });
    assert.equal(sale.startDate, '2026-08-10');
    assert.equal(sale.endDate, '2026-08-15');
  });

  it('recovers Friday/Saturday concert days from a weekend guide', () => {
    const crow = recoverDatesNearTitle({
      title: 'Concert by Sheryl Crow',
      bodyText: 'Sheryl Crow on Friday and The All-American Rejects on Saturday, and more.',
      emailSentAt: '2026-08-13T15:00:12Z',
    });
    assert.equal(crow.startDate, '2026-08-14');
  });

  it('does not assign the first email date to an unrelated title', () => {
    const missed = recoverDatesNearTitle({
      title: 'Unrelated Membership Drive',
      bodyText: 'Melon Summer Smash is Saturday, August 15. Brew at the Zoo is October 10.',
      emailSentAt: SENT,
    });
    assert.equal(missed.startDate, null);
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

describe('newsletter date formats used by Discoveries mail', () => {
  it('resolves Aug. 25th ordinals from KCinsiders-style copy', () => {
    const result = normalizeExtractedEventDate({
      rawDate: 'Aug. 25th',
      emailSentAt: '2026-08-15T19:46:57.000Z',
    });
    assert.equal(result.status, 'resolved');
    assert.equal(result.isoDate, '2026-08-25');
  });

  it('recovers a same-month multi-day range as one start/end pair', () => {
    const recovered = recoverDatesNearTitle({
      title: 'Heritage Festival',
      bodyText: 'Heritage Festival runs Sep 2–6 at Crown Center.',
      emailSentAt: '2026-08-15T12:00:00Z',
    });
    assert.equal(recovered.startDate, '2026-09-02');
    assert.equal(recovered.endDate, '2026-09-06');
  });
});
