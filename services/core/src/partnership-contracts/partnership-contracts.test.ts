import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { businessKeyFor, emailDomainKey, websiteDomainKey } from './business-key.js';
import {
  contactRepresentsBusiness,
  evaluateContactEvidence,
  evidenceStateFromLegacyStatus,
  officialInboxStateForLocalPart,
  resolveNextContactPath,
  stateSupportedByEvidence,
} from './contact-evidence.js';
import {
  assessCompensation,
  compensationPriority,
  deriveCompensationState,
  isCreditAdequate,
  maxReasonableDeliverables,
  parseCompensationComponents,
  type CompensationComponent,
} from './compensation.js';
import {
  evaluateSendReadiness,
  pitchReadinessStatusFor,
  type AnalyticsReadiness,
  type ApprovalReadiness,
  type MediaKitReadiness,
} from './send-readiness.js';
import {
  classifyCreatorPartnership,
  classifyOutreachEmail,
  classifySponsorContact,
  looksLikeInvalidBusinessEntity,
} from './quarantine.js';

const FRESH_ANALYTICS: AnalyticsReadiness = {
  followersAvailable: true,
  followersCount: 6704,
  lastSyncedAt: new Date().toISOString(),
  stale: false,
};

const REAL_MEDIA_KIT: MediaKitReadiness = {
  id: 'kit-1',
  name: 'Kellie KC — Hotel',
  fileSizeBytes: null,
  isTestArtifact: false,
  isGenerated: true,
  webUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel',
};

const APPROVED: ApprovalReadiness = {
  approvedAt: new Date().toISOString(),
  approvedBy: 'kellie',
  approvedContentHash: 'a'.repeat(64),
  approvedRecipient: 'media@crossroadshotelkc.com',
};

describe('businessKeyFor', () => {
  it('collapses legal suffixes and punctuation to one identity', () => {
    assert.equal(
      businessKeyFor('Crossroads Hotel, LLC'),
      businessKeyFor('crossroads hotel'),
    );
    assert.equal(businessKeyFor('Crossroads Hotel Kansas City'), businessKeyFor('Crossroads Hotel'));
  });

  it('ignores where the city qualifier sits in the name', () => {
    assert.equal(
      businessKeyFor('The Loews Hotel Kansas City'),
      businessKeyFor('Loews Kansas City Hotel'),
    );
  });

  it('does not collapse two genuinely different businesses', () => {
    assert.notEqual(businessKeyFor('Crossroads Hotel'), businessKeyFor('Origin Hotel'));
    assert.notEqual(businessKeyFor('Crossroads Hotel'), businessKeyFor('Crossroads Arts District'));
  });

  it('keeps a venue-type word significant rather than guessing a match', () => {
    // Dropping "Hotel" would let "Crossroads Hotel" collide with any other
    // Crossroads-named business in the same district, which would attach a contact to
    // the wrong company. Aliases are handled by explicit portfolio scope instead.
    assert.notEqual(businessKeyFor('Loews Kansas City Hotel'), businessKeyFor('Loews Kansas City'));
  });

  it('derives comparable keys from email and website domains', () => {
    assert.equal(
      emailDomainKey('media@crossroadshotelkc.com'),
      websiteDomainKey('https://crossroadshotelkc.com/contact-2/'),
    );
  });
});

describe('contact evidence states', () => {
  it('never promotes a legacy status to verified without an email', () => {
    const state = evidenceStateFromLegacyStatus({
      status: 'verified_direct_email',
      hasEmail: false,
      hasContactName: true,
      hasWebsite: true,
    });
    assert.equal(state, 'unknown');
  });

  it('maps an unrecognised legacy status to inferred_unverified, not to a verified state', () => {
    const state = evidenceStateFromLegacyStatus({
      status: 'probably_fine_i_guess',
      hasEmail: true,
      hasContactName: false,
      hasWebsite: true,
    });
    assert.equal(state, 'inferred_unverified');
  });

  it('classifies a media inbox as a role inbox and a front desk as general', () => {
    assert.equal(officialInboxStateForLocalPart('media'), 'verified_role_inbox');
    assert.equal(officialInboxStateForLocalPart('social.media'), 'verified_role_inbox');
    assert.equal(officialInboxStateForLocalPart('info'), 'official_general_inbox');
    assert.equal(officialInboxStateForLocalPart('hello'), 'official_general_inbox');
  });

  it('allows email from a verified role inbox', () => {
    const verdict = evaluateContactEvidence(
      {
        state: 'verified_role_inbox',
        email: 'media@crossroadshotelkc.com',
        evidenceUrl: 'https://crossroadshotelkc.com/contact-2/',
        evidenceCapturedAt: new Date().toISOString(),
        sourceIsOfficial: true,
      },
      'Crossroads Hotel',
    );
    assert.equal(verdict.emailSendAllowed, true);
    assert.equal(verdict.deliveryChannel, 'email');
    assert.deepEqual(verdict.blockers, []);
  });

  it('refuses email from an inferred contact no matter what else is true', () => {
    const verdict = evaluateContactEvidence(
      {
        state: 'inferred_unverified',
        email: 'marketing@originhotelkc.com',
        sourceIsOfficial: false,
      },
      'Origin Hotel Kansas City',
    );
    assert.equal(verdict.emailSendAllowed, false);
    assert.ok(verdict.blockers.some((b) => b.includes('not confirmed by an official source')));
  });

  it('treats an official form as a real path that Benson does not auto-submit', () => {
    const verdict = evaluateContactEvidence(
      {
        state: 'official_contact_form',
        contactFormUrl: 'https://www.loewshotels.com/influencer-stay-request',
        sourceIsOfficial: true,
      },
      'Loews Kansas City',
    );
    assert.equal(verdict.emailSendAllowed, false);
    assert.equal(verdict.deliveryChannel, 'official_form');
    assert.equal(verdict.nextPath, 'official_contact_form');
    assert.ok(verdict.nextPathDetail.includes('you submit it'));
  });

  it('falls back to monitor_only rather than guessing a contact', () => {
    const next = resolveNextContactPath({
      contactFormUrl: null,
      email: null,
      phone: null,
      officialSocialUrl: null,
      personName: null,
      state: 'unknown',
    });
    assert.equal(next.path, 'monitor_only');
    assert.ok(next.detail.includes('will not guess'));
  });

  it('blocks a fixture contact even when the stored state claims verification', () => {
    const verdict = evaluateContactEvidence(
      { state: 'verified_named_decision_maker', email: 'canary.plato.123@platoscloset-op.test' },
      'Plato\u2019s Closet Canary',
    );
    assert.equal(verdict.emailSendAllowed, false);
    assert.equal(verdict.recipientSafety.syntheticFixture, true);
  });

  it('flags stale evidence on an otherwise verified contact', () => {
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const verdict = evaluateContactEvidence(
      {
        state: 'verified_named_decision_maker',
        email: 'someone@visitkc.com',
        evidenceCapturedAt: old,
        sourceIsOfficial: true,
      },
      'Visit KC',
    );
    assert.equal(verdict.staleEvidence, true);
    assert.equal(verdict.emailSendAllowed, false);
  });

  it('refuses to reuse a corporate contact for the wrong property', () => {
    const result = contactRepresentsBusiness({
      representsBusiness: 'Loews Hotels & Co',
      targetBusinessName: 'Crossroads Hotel',
      businessKeyFn: businessKeyFor,
    });
    assert.equal(result.ok, false);
    assert.ok(result.reason?.includes('will not reuse it here'));
  });

  it('accepts a portfolio contact for a property inside its stated scope', () => {
    const result = contactRepresentsBusiness({
      representsBusiness: 'Loews Hotels & Co',
      targetBusinessName: 'Loews Kansas City Hotel',
      portfolioScope: ['Loews Kansas City Hotel'],
      businessKeyFn: businessKeyFor,
    });
    assert.equal(result.ok, true);
  });
});

describe('compensation model', () => {
  const cash: CompensationComponent = {
    kind: 'creator_fee',
    amountUsd: 750,
    detail: '$750 creator fee',
  };
  const room: CompensationComponent = {
    kind: 'complimentary_room',
    amountUsd: 289,
    detail: 'one complimentary king room',
  };
  const discount: CompensationComponent = {
    kind: 'partial_discount',
    amountUsd: null,
    percentOff: 15,
    detail: '15% off the best available rate',
  };
  const smallCredit: CompensationComponent = {
    kind: 'dining_credit',
    amountUsd: 50,
    detail: '$50 dining credit',
  };

  it('derives cash_plus_hosted when both are present', () => {
    assert.equal(deriveCompensationState({ offered: [cash, room] }).state, 'cash_plus_hosted');
  });

  it('never describes a discount as a gifted experience', () => {
    const derived = deriveCompensationState({ offered: [discount] });
    assert.equal(derived.state, 'discount_only');
    assert.equal(derived.isPartial, true);
    assert.ok(derived.notes.some((n) => n.includes('not a gifted or hosted experience')));
  });

  it('treats an unpriced credit as partial rather than assuming it covers the experience', () => {
    const derived = deriveCompensationState({
      offered: [{ kind: 'gift_card', amountUsd: null, detail: 'a gift card' }],
      estimatedExperienceCostUsd: 300,
    });
    assert.equal(derived.state, 'gift_card_or_credit');
    assert.equal(derived.isPartial, true);
  });

  it('treats a credit smaller than the experience as partial compensation', () => {
    const derived = deriveCompensationState({
      offered: [smallCredit],
      estimatedExperienceCostUsd: 300,
    });
    assert.equal(derived.isPartial, true);
    assert.ok(derived.notes.some((n) => n.includes('partial compensation')));
  });

  it('accepts a credit that covers the experience', () => {
    const adequacy = isCreditAdequate({ creditUsd: 350, estimatedExperienceCostUsd: 300 });
    assert.equal(adequacy.adequate, true);
  });

  it('reports unknown_requires_research when nothing has been offered', () => {
    assert.equal(
      deriveCompensationState({ offered: [] }).state,
      'unknown_requires_research',
    );
  });

  it('keeps what was offered separate from what Benson recommends requesting', () => {
    const assessment = assessCompensation({
      offered: [discount],
      requested: [room, { kind: 'dining_credit', amountUsd: 150, detail: '$150 dining credit' }],
      businessName: 'Crossroads Hotel',
      estimatedExperienceCostUsd: 400,
    });
    assert.ok(assessment.offeredSummary.startsWith('Crossroads Hotel has offered'));
    assert.ok(assessment.requestedSummary.startsWith('Benson recommends requesting'));
    assert.notEqual(assessment.offeredSummary, assessment.requestedSummary);
    assert.ok(assessment.displaySummary.includes('Discount only'));
  });

  it('states a cold pitch as a request rather than as unknown', () => {
    // A first approach has nothing offered yet, but Benson knows exactly what it is
    // asking for. Calling that "unknown" would block every cold pitch, since the pitch
    // is how compensation gets established.
    const assessment = assessCompensation({
      offered: [],
      requested: [room, { kind: 'dining_credit', amountUsd: null, detail: 'a dining credit' }],
      businessName: 'Crossroads Hotel',
    });
    assert.equal(assessment.basis, 'requested');
    assert.equal(assessment.state, 'fully_hosted');
    assert.match(assessment.label, /^Requesting/);
    assert.match(assessment.offeredSummary, /has not offered anything yet/);
  });

  it('lets a real offer override the requested position', () => {
    const assessment = assessCompensation({
      offered: [discount],
      requested: [room],
      businessName: 'Crossroads Hotel',
    });
    assert.equal(assessment.basis, 'offered');
    assert.equal(assessment.state, 'discount_only');
    assert.doesNotMatch(assessment.label, /^Requesting/);
  });

  it('is unknown only when there is neither an offer nor an ask', () => {
    const assessment = assessCompensation({ offered: [], requested: [] });
    assert.equal(assessment.basis, 'neither');
    assert.equal(assessment.state, 'unknown_requires_research');
  });

  it('accepts an inbox on a domain built from the business name', () => {
    // info@crossroadshotelkc.com is plainly the Crossroads Hotel's own inbox.
    const result = stateSupportedByEvidence({
      claimed: 'official_general_inbox',
      email: 'info@crossroadshotelkc.com',
      evidenceUrl: null,
      sourceIsOfficial: false,
      businessName: 'Crossroads Hotel',
    });
    assert.equal(result.state, 'official_general_inbox');
    assert.equal(result.downgradeReason, null);
  });

  it("refuses another business's inbox even when the local part looks official", () => {
    // Live data had Aerie carrying a soccer club's address, scraped from a page that
    // merely mentioned the brand. Sending there reaches a real stranger.
    const result = stateSupportedByEvidence({
      claimed: 'official_general_inbox',
      email: 'info@kclegendssoccer.com',
      evidenceUrl: null,
      sourceIsOfficial: false,
      businessName: 'Aerie',
    });
    assert.equal(result.state, 'inferred_unverified');
    assert.match(result.downgradeReason ?? '', /cannot confirm/);
  });

  it('refuses a shopping centre inbox standing in for a tenant brand', () => {
    const result = stateSupportedByEvidence({
      claimed: 'official_general_inbox',
      email: 'info@legendsshopping.com',
      evidenceUrl: null,
      sourceIsOfficial: false,
      businessName: 'Nordstrom Rack',
    });
    assert.equal(result.state, 'inferred_unverified');
  });

  it('accepts an address confirmed by an official page on the same domain', () => {
    const result = stateSupportedByEvidence({
      claimed: 'verified_role_inbox',
      email: 'media@crossroadshotelkc.com',
      evidenceUrl: 'https://crossroadshotelkc.com/history-and-about/contact/',
      sourceIsOfficial: true,
      businessName: 'Crossroads Hotel',
    });
    assert.equal(result.state, 'verified_role_inbox');
  });

  it('refuses a personal mail provider as an official inbox', () => {
    const result = stateSupportedByEvidence({
      claimed: 'official_general_inbox',
      email: 'crossroadshotelkc@gmail.com',
      evidenceUrl: null,
      sourceIsOfficial: false,
      businessName: 'Crossroads Hotel',
    });
    assert.equal(result.state, 'inferred_unverified');
    assert.match(result.downgradeReason ?? '', /personal mail provider/);
  });

  it('never upgrades a state, only downgrades it', () => {
    const result = stateSupportedByEvidence({
      claimed: 'inferred_unverified',
      email: 'media@crossroadshotelkc.com',
      evidenceUrl: 'https://crossroadshotelkc.com/history-and-about/contact/',
      sourceIsOfficial: true,
      businessName: 'Crossroads Hotel',
    });
    assert.equal(result.state, 'inferred_unverified');
  });

  it('ranks an inadequate credit below a plain discount', () => {
    assert.ok(
      compensationPriority('gift_card_or_credit', true) <
        compensationPriority('discount_only', true),
    );
    assert.ok(
      compensationPriority('cash_plus_hosted', false) > compensationPriority('cash', false),
    );
    assert.ok(compensationPriority('cash', false) > compensationPriority('fully_hosted', false));
  });

  it('does not allow heavy deliverables against weak compensation', () => {
    assert.equal(maxReasonableDeliverables('discount_only', true).count, 1);
    assert.equal(maxReasonableDeliverables('gift_card_or_credit', true).count, 1);
    assert.ok(maxReasonableDeliverables('cash_plus_hosted', false).count > 2);
  });

  it('drops unknown component kinds when parsing stored jsonb', () => {
    const parsed = parseCompensationComponents([
      { kind: 'creator_fee', amountUsd: 500, detail: 'fee' },
      { kind: 'free_puppy', amountUsd: 1, detail: 'nope' },
      'garbage',
    ]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]!.kind, 'creator_fee');
  });
});

describe('send-readiness gate', () => {
  const verifiedContact = {
    state: 'verified_role_inbox' as const,
    email: 'media@crossroadshotelkc.com',
    evidenceUrl: 'https://crossroadshotelkc.com/contact-2/',
    evidenceCapturedAt: new Date().toISOString(),
    sourceIsOfficial: true,
  };

  it('is send-ready only when every requirement holds', () => {
    const verdict = evaluateSendReadiness({
      contact: verifiedContact,
      businessName: 'Crossroads Hotel',
      compensationState: 'fully_hosted',
      analytics: FRESH_ANALYTICS,
      mediaKit: REAL_MEDIA_KIT,
      approval: APPROVED,
    });
    assert.equal(verdict.sendReady, true);
    assert.equal(verdict.state, 'send_ready');
    assert.equal(verdict.summary, null);
    assert.equal(pitchReadinessStatusFor(verdict), 'ready_for_review');
  });

  it('blocks and names the missing step when compensation is unknown', () => {
    const verdict = evaluateSendReadiness({
      contact: verifiedContact,
      businessName: 'Crossroads Hotel',
      compensationState: 'unknown_requires_research',
      analytics: FRESH_ANALYTICS,
      mediaKit: REAL_MEDIA_KIT,
      approval: APPROVED,
    });
    assert.equal(verdict.sendReady, false);
    assert.equal(pitchReadinessStatusFor(verdict), 'needs_compensation');
    assert.ok(verdict.summary?.includes('compensation'));
  });

  it('rejects the 69-byte test media kit', () => {
    const verdict = evaluateSendReadiness({
      contact: verifiedContact,
      businessName: 'Crossroads Hotel',
      compensationState: 'fully_hosted',
      analytics: FRESH_ANALYTICS,
      mediaKit: {
        id: 'kit-legacy',
        name: 'Upload Test',
        fileSizeBytes: 69,
        isTestArtifact: false,
        isGenerated: false,
        webUrl: null,
      },
      approval: APPROVED,
    });
    assert.equal(verdict.sendReady, false);
    assert.equal(pitchReadinessStatusFor(verdict), 'needs_media_kit');
  });

  it('refuses to send when live analytics did not resolve', () => {
    const verdict = evaluateSendReadiness({
      contact: verifiedContact,
      businessName: 'Crossroads Hotel',
      compensationState: 'fully_hosted',
      analytics: {
        followersAvailable: false,
        followersCount: null,
        lastSyncedAt: null,
        stale: false,
      },
      mediaKit: REAL_MEDIA_KIT,
      approval: APPROVED,
    });
    assert.equal(verdict.sendReady, false);
    assert.equal(pitchReadinessStatusFor(verdict), 'needs_analytics');
  });

  it('is not send-ready without an approval record', () => {
    const verdict = evaluateSendReadiness({
      contact: verifiedContact,
      businessName: 'Crossroads Hotel',
      compensationState: 'fully_hosted',
      analytics: FRESH_ANALYTICS,
      mediaKit: REAL_MEDIA_KIT,
      approval: { approvedAt: null, approvedBy: null, approvedContentHash: null, approvedRecipient: null },
    });
    assert.equal(verdict.sendReady, false);
    assert.equal(verdict.reviewReady, true);
    assert.ok(verdict.blocks.some((b) => b.code === 'not_approved'));
  });

  it('a guessed contact can never become send-ready — Origin Hotel acceptance case', () => {
    const verdict = evaluateSendReadiness({
      contact: {
        state: 'inferred_unverified',
        email: 'marketing@originhotelkansascity.com',
        sourceIsOfficial: false,
      },
      businessName: 'Origin Hotel Kansas City',
      compensationState: 'fully_hosted',
      analytics: FRESH_ANALYTICS,
      mediaKit: REAL_MEDIA_KIT,
      approval: APPROVED,
    });
    assert.equal(verdict.sendReady, false);
    assert.ok(verdict.blocks.some((b) => b.code === 'contact_evidence_unverified'));
    assert.ok(verdict.summary && verdict.summary.length > 0);
  });

  it('lets a form-only opportunity reach review without becoming sendable', () => {
    const verdict = evaluateSendReadiness({
      contact: {
        state: 'official_contact_form',
        contactFormUrl: 'https://www.loewshotels.com/influencer-stay-request',
        sourceIsOfficial: true,
      },
      businessName: 'Loews Kansas City',
      compensationState: 'fully_hosted',
      analytics: FRESH_ANALYTICS,
      mediaKit: REAL_MEDIA_KIT,
      approval: { approvedAt: null, approvedBy: null, approvedContentHash: null, approvedRecipient: null },
    });
    assert.equal(verdict.sendReady, false);
    assert.equal(verdict.reviewReady, true);
    assert.equal(verdict.state, 'review_ready_form_only');
  });

  it('reports an already-sent pitch as sent rather than blocked', () => {
    const verdict = evaluateSendReadiness({
      contact: verifiedContact,
      businessName: 'Crossroads Hotel',
      compensationState: 'fully_hosted',
      analytics: FRESH_ANALYTICS,
      mediaKit: REAL_MEDIA_KIT,
      approval: APPROVED,
      alreadySent: true,
    });
    assert.equal(verdict.state, 'sent');
    assert.equal(pitchReadinessStatusFor(verdict), 'sent');
  });

  it('blocks a contact that belongs to a different business', () => {
    const verdict = evaluateSendReadiness({
      contact: verifiedContact,
      businessName: 'Origin Hotel Kansas City',
      contactBusinessMismatchReason:
        'This contact represents Crossroads Hotel, not Origin Hotel Kansas City. Benson will not reuse it here.',
      compensationState: 'fully_hosted',
      analytics: FRESH_ANALYTICS,
      mediaKit: REAL_MEDIA_KIT,
      approval: APPROVED,
    });
    assert.equal(verdict.sendReady, false);
    assert.ok(verdict.blocks.some((b) => b.code === 'contact_wrong_business'));
  });
});

describe('backlog quarantine', () => {
  const now = new Date('2026-09-03T05:00:00Z');
  const recent = new Date('2026-09-01T05:00:00Z').toISOString();

  it('recognises a thread headline promoted into contacts', () => {
    const result = looksLikeInvalidBusinessEntity('Who has the best pistachio latte in KC?');
    assert.equal(result.invalid, true);
    assert.ok(result.reason?.includes('question'));
  });

  it('recognises a listicle headline', () => {
    assert.equal(
      looksLikeInvalidBusinessEntity('17 Kansas City Farmers Markets Worth Exploring').invalid,
      true,
    );
  });

  it('recognises a hotel rate-plan name', () => {
    assert.equal(looksLikeInvalidBusinessEntity('Advance Purchase Offer').invalid, true);
  });

  it('accepts a real business name', () => {
    assert.equal(looksLikeInvalidBusinessEntity('Crossroads Hotel').invalid, false);
    assert.equal(looksLikeInvalidBusinessEntity('Loews Kansas City Hotel').invalid, false);
  });

  it('quarantines the smoke-test fixtures', () => {
    const decision = classifyOutreachEmail({
      status: 'ready_to_send',
      createdAt: '2026-08-10T00:00:00Z',
      businessName: 'Plato\u2019s Closet Canary',
      contactEmail: 'canary.plato.1@platoscloset-op.test',
      contactNotes: 'smoke test',
      contactVerificationStatus: 'verified_direct_email',
      pitchReadinessStatus: 'ready_for_review',
      now,
    });
    assert.equal(decision.state, 'quarantined_synthetic');
  });

  it('quarantines a 58-day-old draft as stale rather than deleting it', () => {
    const decision = classifyOutreachEmail({
      status: 'drafted',
      createdAt: '2026-07-07T00:00:00Z',
      businessName: 'Some Real Cafe',
      contactEmail: 'info@somerealcafe.com',
      contactNotes: null,
      contactVerificationStatus: 'generic_business_channel',
      pitchReadinessStatus: 'ready_for_review',
      now,
    });
    assert.equal(decision.state, 'quarantined_stale');
    assert.ok(decision.reason?.includes('days old'));
  });

  it('quarantines a draft with no route to anywhere', () => {
    const decision = classifyOutreachEmail({
      status: 'drafted',
      createdAt: recent,
      businessName: 'Some Real Cafe',
      contactEmail: null,
      contactNotes: null,
      contactVerificationStatus: 'found_unverified',
      pitchReadinessStatus: 'ready_for_review',
      now,
    });
    assert.equal(decision.state, 'quarantined_weak');
  });

  it('keeps a fresh, verified, evidenced draft active', () => {
    const decision = classifyOutreachEmail({
      status: 'drafted',
      createdAt: recent,
      businessName: 'Crossroads Hotel',
      contactEmail: 'media@crossroadshotelkc.com',
      contactNotes: 'Published on the official contact page.',
      contactVerificationStatus: 'verified_role_email',
      pitchReadinessStatus: 'ready_for_review',
      now,
    });
    assert.equal(decision.state, 'active');
    assert.equal(decision.reason, null);
  });

  it('leaves already-sent history alone', () => {
    const decision = classifyOutreachEmail({
      status: 'sent',
      createdAt: '2026-07-01T00:00:00Z',
      businessName: 'Crossroads Hotel',
      contactEmail: 'media@crossroadshotelkc.com',
      contactNotes: null,
      contactVerificationStatus: 'verified_role_email',
      pitchReadinessStatus: 'sent',
      now,
    });
    assert.equal(decision.state, 'active');
  });

  it('quarantines a contact whose name is a headline', () => {
    const decision = classifySponsorContact({
      businessName: 'Who has the best pistachio latte in KC?',
      email: null,
      notes: null,
      contactVerificationStatus: null,
    });
    assert.equal(decision.state, 'quarantined_invalid_entity');
  });

  it('quarantines an unscored partnership stub that has gone quiet', () => {
    const decision = classifyCreatorPartnership({
      brandName: 'Some Brand',
      pipelineStatus: 'discovered',
      fitScore: null,
      researchStatus: null,
      updatedAt: '2026-07-01T00:00:00Z',
      now,
    });
    assert.equal(decision.state, 'quarantined_weak');
  });

  it('keeps a scored partnership active', () => {
    const decision = classifyCreatorPartnership({
      brandName: 'Crossroads Hotel',
      pipelineStatus: 'researched',
      fitScore: 82,
      researchStatus: 'complete',
      updatedAt: '2026-09-01T00:00:00Z',
      now,
    });
    assert.equal(decision.state, 'active');
  });
});
