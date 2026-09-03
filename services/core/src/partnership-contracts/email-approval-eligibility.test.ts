import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateEmailApprovalEligibility,
  evaluateFormPacketEligibility,
} from './email-approval-eligibility.js';
import { looksLikeGenericTemplatePitch } from './generic-pitch.js';
import { classifyOutreachEmail, looksLikeInvalidBusinessEntity } from './quarantine.js';

const crossroadsBase = {
  status: 'needs_approval',
  quarantineState: 'active',
  businessName: 'Crossroads Hotel',
  contactEmail: 'media@crossroadshotelkc.com',
  contactNotes: null,
  contactEvidenceState: 'verified_role_inbox',
  evidenceUrl: 'https://crossroadshotelkc.com/history-and-about/contact/',
  compensationState: 'fully_hosted',
  pitchReadinessStatus: 'ready_for_review',
  subject: 'Second Company Showcase Video at Crossroads Hotel — Sept 5',
  body: 'Second Company Showcase at Crossroads on Sept 5th…',
  mediaKitId: 'kit-1',
  mediaKitKind: 'generated_business',
  mediaKitIsTestArtifact: false,
  mediaKitCurrentVersionId: 'ver-1',
  mediaKitCurrentContentHash: 'abc123',
};

describe('email approval eligibility invariants', () => {
  it('allows an evidenced Crossroads-style email pitch', () => {
    const verdict = evaluateEmailApprovalEligibility(crossroadsBase);
    assert.equal(verdict.eligible, true);
    assert.equal(verdict.formOnly, false);
  });

  it('rejects contactless pitches by invariant, not title', () => {
    const verdict = evaluateEmailApprovalEligibility({
      ...crossroadsBase,
      businessName: 'Some Real Boutique',
      contactEmail: null,
      contactEvidenceState: 'official_contact_form',
      subject: 'Your Casual Styles — Let’s Collaborate!',
      body:
        'Your recent call caught my eye. My viewers love discovering local gems like yours. With over 5K followers… Would you be open to discussing a gift card or exclusive discount code… Let’s collaborate!',
      mediaKitId: null,
      mediaKitCurrentVersionId: null,
      mediaKitCurrentContentHash: null,
      compensationState: null,
      pitchReadinessStatus: 'researching',
    });
    assert.equal(verdict.eligible, false);
    assert.ok(verdict.reasons.some((r) => /missing email|contact-form/i.test(r)));
  });

  it('rejects form-only Loews from the email queue', () => {
    const verdict = evaluateEmailApprovalEligibility({
      ...crossroadsBase,
      businessName: 'Loews Kansas City Hotel',
      contactEmail: null,
      contactEvidenceState: 'official_contact_form',
      evidenceUrl: 'https://www.loewshotels.com/influencer-stay-request',
    });
    assert.equal(verdict.eligible, false);
    assert.equal(verdict.formOnly, true);
  });

  it('keeps form packets eligible for the manual workflow', () => {
    const verdict = evaluateFormPacketEligibility({
      ...crossroadsBase,
      businessName: 'Loews Kansas City Hotel',
      contactEmail: null,
      contactEvidenceState: 'official_contact_form',
      evidenceUrl: 'https://www.loewshotels.com/influencer-stay-request',
    });
    assert.equal(verdict.eligible, true);
  });

  it('blocks synthetic fixtures and Hilton crisis inbox', () => {
    assert.equal(
      evaluateEmailApprovalEligibility({
        ...crossroadsBase,
        contactEmail: 'canary@brand.test',
        businessName: 'Canary Fixture',
      }).eligible,
      false,
    );
    assert.equal(
      evaluateEmailApprovalEligibility({
        ...crossroadsBase,
        contactEmail: 'breakingnews@hilton.com',
      }).eligible,
      false,
    );
  });
});

describe('junk pitch quarantine invariants', () => {
  it('marks Selling Men’s Casual Styles as an invalid entity', () => {
    assert.equal(looksLikeInvalidBusinessEntity("Selling Men's Casual Styles").invalid, true);
  });

  it('quarantines generic contactless form rows without needing the title', () => {
    const decision = classifyOutreachEmail({
      status: 'needs_approval',
      createdAt: '2026-09-01T00:00:00Z',
      businessName: 'Downtown Boutique',
      contactEmail: null,
      contactNotes: null,
      contactVerificationStatus: 'official_contact_form',
      contactEvidenceState: 'official_contact_form',
      evidenceUrl: null,
      pitchReadinessStatus: 'researching',
      subject: 'Your Casual Styles — Let’s Collaborate!',
      body:
        'local gems like yours. With over 5K followers… gift card or exclusive discount… Let’s collaborate!',
      now: new Date('2026-09-03T00:00:00Z'),
    });
    assert.equal(decision.state, 'quarantined_weak');
  });

  it('detects generic template stacks', () => {
    assert.equal(
      looksLikeGenericTemplatePitch({
        subject: 'Let’s Collaborate!',
        body: 'local gems like yours. With over 5K followers. gift card or exclusive discount.',
      }),
      true,
    );
  });
});
