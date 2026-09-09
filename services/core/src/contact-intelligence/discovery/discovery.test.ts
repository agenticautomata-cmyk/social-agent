import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateContactEvidence } from '../../partnership-contracts/contact-evidence.js';
import {
  admitDiscoveryRecord,
  applyFreshnessToDiscoveryState,
  classifyRouteOntoSearchStep,
  CONTACT_DISCOVERY_STEPS,
  createDiscoveryEvidenceRecord,
  DISCOVERY_IMPORTANT_PITCH_RECHECK_DAYS,
  DISCOVERY_ROUTINE_RECHECK_MAX_DAYS,
  DISCOVERY_ROUTINE_RECHECK_MIN_DAYS,
  enqueueDiscoveryForReview,
  evaluateDiscoveryFreshness,
  evaluateDiscoveryPurpose,
  evaluateEmailFormatInference,
  isReviewItemActionable,
  KC_METRO_DISCOVERY_CATEGORIES,
  mayReplaceDiscoveryStep,
  orderedDiscoverySteps,
  quarantineConflictingEvidence,
  toContactEvidenceRecord,
  toSendEvidenceState,
} from './index.js';

describe('contact discovery search order', () => {
  it('defines nine steps in strict priority order', () => {
    assert.equal(CONTACT_DISCOVERY_STEPS.length, 9);
    const steps = orderedDiscoverySteps().map((s) => s.step);
    assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(CONTACT_DISCOVERY_STEPS[0]!.id, 'official_media_press');
    assert.equal(CONTACT_DISCOVERY_STEPS[8]!.id, 'monitor_only');
  });

  it('never lets a weaker route replace a stronger one', () => {
    assert.equal(
      mayReplaceDiscoveryStep('official_media_press', 'general_business_contact'),
      false,
    );
    assert.equal(
      mayReplaceDiscoveryStep('general_business_contact', 'official_media_press'),
      true,
    );
    assert.equal(mayReplaceDiscoveryStep(null, 'monitor_only'), false);
  });

  it('maps route kinds onto search steps', () => {
    assert.equal(
      classifyRouteOntoSearchStep({ routeKind: 'creator_program' }),
      'creator_influencer_program',
    );
    assert.equal(classifyRouteOntoSearchStep({ routeKind: 'none' }), 'monitor_only');
  });

  it('covers the KC metro category set from the mission', () => {
    assert.ok(KC_METRO_DISCOVERY_CATEGORIES.includes('tourism'));
    assert.ok(KC_METRO_DISCOVERY_CATEGORIES.includes('hotels'));
    assert.ok(KC_METRO_DISCOVERY_CATEGORIES.includes('black_owned'));
    assert.ok(KC_METRO_DISCOVERY_CATEGORIES.includes('pr_agencies_local'));
    assert.ok(KC_METRO_DISCOVERY_CATEGORIES.includes('hosted_visit'));
    assert.equal(KC_METRO_DISCOVERY_CATEGORIES.length, 16);
  });
});

describe('discovery freshness windows', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');

  it('uses a 60–90 day routine window', () => {
    assert.equal(DISCOVERY_ROUTINE_RECHECK_MIN_DAYS, 60);
    assert.equal(DISCOVERY_ROUTINE_RECHECK_MAX_DAYS, 90);
  });

  it('marks evidence fresh inside 60 days', () => {
    const captured = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const verdict = evaluateDiscoveryFreshness({
      evidenceCapturedAt: captured,
      discoveryState: 'verified_role_inbox',
      now,
    });
    assert.equal(verdict.status, 'fresh');
    assert.equal(verdict.needsRecheck, false);
  });

  it('marks due_soon inside the 60–90 window', () => {
    const captured = new Date(now.getTime() - 75 * 86_400_000).toISOString();
    const verdict = evaluateDiscoveryFreshness({
      evidenceCapturedAt: captured,
      discoveryState: 'verified_role_inbox',
      now,
    });
    assert.equal(verdict.status, 'due_soon');
    assert.equal(verdict.needsRecheck, false);
  });

  it('marks overdue after 90 days', () => {
    const captured = new Date(now.getTime() - 100 * 86_400_000).toISOString();
    const verdict = evaluateDiscoveryFreshness({
      evidenceCapturedAt: captured,
      discoveryState: 'verified_role_inbox',
      now,
    });
    assert.equal(verdict.status, 'overdue');
    assert.equal(verdict.needsRecheck, true);
  });

  it('requires immediate recheck for older named contacts', () => {
    const captured = new Date(now.getTime() - 70 * 86_400_000).toISOString();
    const verdict = evaluateDiscoveryFreshness({
      evidenceCapturedAt: captured,
      discoveryState: 'verified_named_contact',
      now,
    });
    assert.equal(verdict.status, 'immediate_named');
    assert.equal(verdict.needsRecheck, true);
  });

  it('requires recheck before an important pitch when evidence is older than the short window', () => {
    const captured = new Date(
      now.getTime() - (DISCOVERY_IMPORTANT_PITCH_RECHECK_DAYS + 2) * 86_400_000,
    ).toISOString();
    const verdict = evaluateDiscoveryFreshness({
      evidenceCapturedAt: captured,
      discoveryState: 'verified_role_inbox',
      importantPitch: true,
      now,
    });
    assert.equal(verdict.status, 'important_pitch_recheck');
    assert.equal(verdict.needsRecheck, true);
  });

  it('quarantines conflicts via freshness overlay', () => {
    const state = applyFreshnessToDiscoveryState(
      'verified_role_inbox',
      evaluateDiscoveryFreshness({
        evidenceCapturedAt: now.toISOString(),
        discoveryState: 'verified_role_inbox',
        conflictNote: 'Page now lists a different media address',
        now,
      }),
    );
    assert.equal(state, 'conflicting');
  });
});

describe('purpose blocklist checks', () => {
  it('blocks crisis, legal, privacy, security, and investor-relations local-parts', () => {
    assert.equal(evaluateDiscoveryPurpose({ email: 'breakingnews@hilton.com' }).allowed, false);
    assert.equal(evaluateDiscoveryPurpose({ email: 'legal@example.com' }).kind, 'legal');
    assert.equal(evaluateDiscoveryPurpose({ email: 'privacy@example.com' }).kind, 'privacy');
    assert.equal(evaluateDiscoveryPurpose({ email: 'security@example.com' }).kind, 'security');
    assert.equal(evaluateDiscoveryPurpose({ email: 'ir@example.com' }).kind, 'investor_relations');
    assert.equal(evaluateDiscoveryPurpose({ email: 'newstips@example.com' }).kind, 'unrelated_press');
  });

  it('allows published media/press/partnership role inboxes', () => {
    assert.equal(evaluateDiscoveryPurpose({ email: 'media@crossroadshotelkc.com' }).allowed, true);
    assert.equal(evaluateDiscoveryPurpose({ email: 'press@visitkc.com' }).allowed, true);
    assert.equal(evaluateDiscoveryPurpose({ email: 'partnerships@example.com' }).allowed, true);
  });

  it('honors explicit blocklist entries', () => {
    const verdict = evaluateDiscoveryPurpose({
      email: 'media@example.com',
      explicitBlocklist: [
        {
          address: 'media@example.com',
          reason: 'Operator removed — inbox now forwards to legal only.',
        },
      ],
    });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.kind, 'explicit_blocklist');
  });

  it('blocks by published label even when local-part looks fine', () => {
    const verdict = evaluateDiscoveryPurpose({
      email: 'desk@example.com',
      publishedLabel: 'News tip line',
    });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.kind, 'unrelated_press');
  });
});

describe('no email-format inference', () => {
  it('refuses inventing an address from a name and domain', () => {
    const verdict = evaluateEmailFormatInference({
      personName: 'Makenzie Wolters',
      guessedDomain: 'visitkc.com',
      observedOnOfficialPage: false,
    });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.patternFamily, 'generic_guess');
  });

  it('refuses first.last and flast patterns when not observed on an official page', () => {
    const firstLast = evaluateEmailFormatInference({
      personName: 'Jane Smith',
      email: 'jane.smith@hotel.example',
      observedOnOfficialPage: false,
    });
    assert.equal(firstLast.allowed, false);
    assert.equal(firstLast.patternFamily, 'first_dot_last');

    const flast = evaluateEmailFormatInference({
      personName: 'Jane Smith',
      email: 'jsmith@hotel.example',
      observedOnOfficialPage: false,
    });
    assert.equal(flast.allowed, false);
    assert.equal(flast.patternFamily, 'flast');
  });

  it('allows an address only when observed on an official page', () => {
    const verdict = evaluateEmailFormatInference({
      personName: 'Jane Smith',
      email: 'jane.smith@hotel.example',
      observedOnOfficialPage: true,
    });
    assert.equal(verdict.allowed, true);
  });
});

describe('evidence record creation and send-contract mapping', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');

  it('creates a verified role-inbox evidence record without producing a pitch', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Crossroads Hotel',
      routeKind: 'media_press',
      email: 'media@crossroadshotelkc.com',
      evidenceUrl: 'https://crossroadshotelkc.com/history-and-about/contact/',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: true,
      publishedLabel: 'Media',
      now,
    });
    assert.equal(record.discoveryState, 'verified_role_inbox');
    assert.equal(record.sendEvidenceState, 'verified_role_inbox');
    assert.equal(record.searchStepId, 'official_media_press');
    assert.equal(record.producesPitch, false);

    const send = evaluateContactEvidence(toContactEvidenceRecord(record), 'Crossroads Hotel');
    assert.equal(send.emailSendAllowed, true);
  });

  it('never promotes a name-inferred email to a verified send state', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Visit KC',
      routeKind: 'staff_directory',
      personName: 'Makenzie Wolters',
      email: 'makenzie.wolters@visitkc.com',
      evidenceUrl: 'https://www.visitkc.com/media-center/contact-us/',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: false,
      now,
    });
    assert.equal(record.discoveryState, 'inferred_unverified');
    assert.equal(toSendEvidenceState(record.discoveryState), 'inferred_unverified');
    const send = evaluateContactEvidence(toContactEvidenceRecord(record), 'Visit KC');
    assert.equal(send.emailSendAllowed, false);
  });

  it('classifies creator programs as verified_program → official_contact_form for send', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Loews Hotels',
      routeKind: 'creator_program',
      programUrl: 'https://www.loewshotels.com/influencer-stay-request',
      evidenceUrl: 'https://www.loewshotels.com/influencer-stay-request',
      sourceIsOfficial: true,
      now,
    });
    assert.equal(record.discoveryState, 'verified_program');
    assert.equal(record.sendEvidenceState, 'official_contact_form');
    const send = evaluateContactEvidence(toContactEvidenceRecord(record), 'Loews Kansas City');
    assert.equal(send.emailSendAllowed, false);
    assert.equal(send.deliveryChannel, 'official_form');
  });

  it('labels general inboxes as official_general_route, not PR', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Example Venue',
      routeKind: 'general_inbox',
      email: 'info@examplevenue.com',
      evidenceUrl: 'https://examplevenue.com/contact',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: true,
      now,
    });
    assert.equal(record.discoveryState, 'official_general_route');
    assert.equal(record.searchStepId, 'general_business_contact');
  });

  it('blocks wrong-purpose inboxes at evidence creation', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Hilton',
      routeKind: 'media_press',
      email: 'breakingnews@hilton.com',
      evidenceUrl: 'https://hilton.com/press',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: true,
      now,
    });
    assert.equal(record.discoveryState, 'blocked_or_removed');
    assert.ok(record.creationBlockers.some((b) => /crisis|urgent/i.test(b)));
  });

  it('quarantines conflicting evidence instead of deleting it', () => {
    const prior = createDiscoveryEvidenceRecord({
      organizationName: 'Crossroads Hotel',
      routeKind: 'media_press',
      email: 'media@crossroadshotelkc.com',
      evidenceUrl: 'https://crossroadshotelkc.com/contact',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: true,
      now,
    });
    const quarantined = quarantineConflictingEvidence({
      prior,
      conflictingValue: 'press@crossroadshotelkc.com',
      conflictNote: 'Contact page now lists a different address',
      now,
    });
    assert.equal(quarantined.discoveryState, 'conflicting');
    assert.equal(quarantined.email, 'media@crossroadshotelkc.com');
    assert.match(quarantined.conflictNote ?? '', /different address/);
  });
});

describe('review-queue admission', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');

  it('queues newly discovered verified contacts as pending_review, not actionable', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Crossroads Hotel',
      routeKind: 'media_press',
      email: 'media@crossroadshotelkc.com',
      evidenceUrl: 'https://crossroadshotelkc.com/contact',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: true,
      now,
    });
    const item = enqueueDiscoveryForReview(record, now);
    assert.equal(item.status, 'pending_review');
    assert.equal(item.autoCreatePitch, false);
    assert.equal(isReviewItemActionable(item), false);
  });

  it('admits only after explicit review when evidence is official and fresh', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Crossroads Hotel',
      routeKind: 'media_press',
      email: 'media@crossroadshotelkc.com',
      evidenceUrl: 'https://crossroadshotelkc.com/contact',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: true,
      now,
    });
    const pending = enqueueDiscoveryForReview(record, now);
    const admitted = admitDiscoveryRecord(pending, {
      reviewerNote: 'Confirmed on property contact page',
      now,
    });
    assert.equal(admitted.status, 'admitted_actionable');
    assert.equal(isReviewItemActionable(admitted), true);
    assert.equal(admitted.autoCreatePitch, false);
  });

  it('refuses to admit inferred or blocked findings as actionable', () => {
    const inferred = createDiscoveryEvidenceRecord({
      organizationName: 'Visit KC',
      routeKind: 'staff_directory',
      personName: 'Jane Doe',
      email: 'jane.doe@visitkc.com',
      evidenceUrl: 'https://www.visitkc.com/media-center/contact-us/',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: false,
      now,
    });
    const pending = enqueueDiscoveryForReview(inferred, now);
    const admitted = admitDiscoveryRecord(pending, { now });
    assert.equal(admitted.status, 'rejected');
    assert.equal(isReviewItemActionable(admitted), false);
  });

  it('places no-route findings into monitor_only', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Origin Hotel Kansas City',
      routeKind: 'none',
      sourceIsOfficial: true,
      evidenceUrl: 'https://originhotel.com',
      now,
    });
    const item = enqueueDiscoveryForReview(record, now);
    assert.equal(item.status, 'monitor_only');
  });

  it('quarantines conflicting records at enqueue time', () => {
    const record = createDiscoveryEvidenceRecord({
      organizationName: 'Example',
      routeKind: 'media_press',
      email: 'media@example.com',
      evidenceUrl: 'https://example.com/press',
      sourceIsOfficial: true,
      emailObservedOnOfficialPage: true,
      conflictNote: 'Two addresses published for the same desk',
      now,
    });
    const item = enqueueDiscoveryForReview(record, now);
    assert.equal(item.status, 'quarantined');
  });
});
