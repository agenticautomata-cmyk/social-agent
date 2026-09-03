import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchesApprovedContent, outreachContentHash, legacyApprovalMissingHash } from './content-hash.js';

const APPROVED = {
  subject: 'Crossroads staycation collaboration',
  body: 'Hi — I saw the First Fridays rooftop series on your events page.',
  recipient: 'media@crossroadshotelkc.com',
  mediaKitId: 'kit-1',
};

describe('outreachContentHash', () => {
  it('is stable across irrelevant whitespace', () => {
    assert.equal(
      outreachContentHash(APPROVED),
      outreachContentHash({ ...APPROVED, body: `${APPROVED.body}\n` }),
    );
  });

  it('is stable across recipient casing', () => {
    assert.equal(
      outreachContentHash(APPROVED),
      outreachContentHash({ ...APPROVED, recipient: 'Media@CrossroadsHotelKC.com' }),
    );
  });

  it('changes when the body changes', () => {
    assert.notEqual(
      outreachContentHash(APPROVED),
      outreachContentHash({ ...APPROVED, body: 'Hi — I hope this finds you well.' }),
    );
  });

  it('changes when the recipient changes', () => {
    assert.notEqual(
      outreachContentHash(APPROVED),
      outreachContentHash({ ...APPROVED, recipient: 'info@crossroadshotelkc.com' }),
    );
  });

  it('changes when the attached media kit changes', () => {
    assert.notEqual(
      outreachContentHash(APPROVED),
      outreachContentHash({ ...APPROVED, mediaKitId: 'kit-2' }),
    );
  });

  it('changes when the media kit content version changes', () => {
    assert.notEqual(
      outreachContentHash({
        ...APPROVED,
        mediaKitVersionId: 'v1',
        mediaKitContentHash: 'hash-a',
      }),
      outreachContentHash({
        ...APPROVED,
        mediaKitVersionId: 'v2',
        mediaKitContentHash: 'hash-b',
      }),
    );
  });
});

describe('matchesApprovedContent', () => {
  const approvedHash = outreachContentHash(APPROVED);

  it('accepts the exact reviewed version', () => {
    const result = matchesApprovedContent({
      approvedContentHash: approvedHash,
      approvedRecipient: APPROVED.recipient,
      currentSubject: APPROVED.subject,
      currentBody: APPROVED.body,
      currentRecipient: APPROVED.recipient,
      mediaKitId: APPROVED.mediaKitId,
    });
    assert.equal(result.matches, true);
    assert.equal(result.reason, null);
  });

  it('rejects a body edited after approval and says so plainly', () => {
    const result = matchesApprovedContent({
      approvedContentHash: approvedHash,
      approvedRecipient: APPROVED.recipient,
      currentSubject: APPROVED.subject,
      currentBody: 'Completely different pitch.',
      currentRecipient: APPROVED.recipient,
      mediaKitId: APPROVED.mediaKitId,
    });
    assert.equal(result.matches, false);
    assert.match(result.reason ?? '', /media kit changed|edited after Kellie approved/i);
  });

  it('names a swapped recipient specifically', () => {
    const result = matchesApprovedContent({
      approvedContentHash: approvedHash,
      approvedRecipient: APPROVED.recipient,
      currentSubject: APPROVED.subject,
      currentBody: APPROVED.body,
      currentRecipient: 'someone-else@example.org',
      mediaKitId: APPROVED.mediaKitId,
    });
    assert.equal(result.matches, false);
    assert.match(result.reason ?? '', /recipient changed/);
  });

  it('refuses to send when nothing was recorded as approved', () => {
    const result = matchesApprovedContent({
      approvedContentHash: null,
      approvedRecipient: null,
      currentSubject: APPROVED.subject,
      currentBody: APPROVED.body,
      currentRecipient: APPROVED.recipient,
    });
    assert.equal(result.matches, false);
  });
});

describe('legacyApprovalMissingHash', () => {
  it('flags approved rows that lack a content hash', () => {
    assert.equal(
      legacyApprovalMissingHash({
        approvedAt: '2026-07-01T00:00:00.000Z',
        approvedContentHash: null,
      }),
      true,
    );
    assert.equal(
      legacyApprovalMissingHash({
        approvedAt: '2026-07-01T00:00:00.000Z',
        approvedContentHash: 'abc',
      }),
      false,
    );
  });
});
