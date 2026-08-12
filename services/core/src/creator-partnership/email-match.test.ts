import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickBestPartnershipMatch, scoreEmailAgainstPartnership } from './email-match.js';
import { classifyEmailIntent } from './email-intent.js';
import { inferEmailActivity, sanitizeSuggestedStatus } from './infer-email-activity.js';
import { parseFollowUpFromEmail, snapToBusinessReminderHour } from './parse-follow-up.js';
import type { PartnershipFingerprints } from './types.js';

const REKLAIM_FINGERPRINTS: PartnershipFingerprints = {
  brandName: 'REKLAIM',
  retailerNames: ['Jared'],
  programNames: ['Conscious Collective'],
  domains: ['reklaim.com', 'jared.com'],
  keywordPhrases: ['reklaim', 'authenticated pre-owned', 'conscious collective'],
  sharedPlatforms: ['shopmy'],
  updatedAt: new Date().toISOString(),
};

describe('email → partnership matching v1', () => {
  it('1. generic ShopMy approval does NOT match REKLAIM partnership', () => {
    const match = pickBestPartnershipMatch(
      {
        subject: 'Your ShopMy application has been approved',
        bodyText: 'Congratulations! Your ShopMy creator account is approved.',
        senderEmail: 'hello@shopmy.us',
        senderDomain: 'shopmy.us',
        gmailThreadId: 'thread-shopmy-1',
      },
      [{ partnershipId: 'reklaim-id', fingerprints: REKLAIM_FINGERPRINTS }],
    );
    assert.equal(match, null);
    const inferred = inferEmailActivity({
      subject: 'Your ShopMy application has been approved',
      bodyText: 'Congratulations! Your ShopMy creator account is approved.',
      senderDomain: 'shopmy.us',
    });
    assert.equal(inferred.entityType, 'platform');
    assert.equal(sanitizeSuggestedStatus(inferred), null);
  });

  it('2. ShopMy email explicitly mentioning REKLAIM can match REKLAIM record', () => {
    const match = pickBestPartnershipMatch(
      {
        subject: 'ShopMy update for REKLAIM creators',
        bodyText: 'Your REKLAIM storefront on ShopMy is ready.',
        senderEmail: 'hello@shopmy.us',
        senderDomain: 'shopmy.us',
        gmailThreadId: 'thread-shopmy-2',
      },
      [{ partnershipId: 'reklaim-id', fingerprints: REKLAIM_FINGERPRINTS }],
    );
    assert.ok(match);
    assert.equal(match!.partnershipId, 'reklaim-id');
    assert.ok(match!.confidence >= 0.4);
  });

  it('3. direct REKLAIM acceptance email suggests accepted', () => {
    const inferred = inferEmailActivity({
      subject: 'Welcome to the Conscious Collective',
      bodyText: 'Congratulations — you are accepted into the Conscious Collective creator program for REKLAIM.',
      senderDomain: 'reklaim.com',
      knownBrandNames: ['REKLAIM'],
      knownProgramNames: ['Conscious Collective'],
    });
    assert.equal(inferred.activityType, 'program_approved');
    assert.equal(inferred.entityType, 'program');
    assert.equal(sanitizeSuggestedStatus(inferred), 'accepted');
  });

  it('4. generic ShopMy campaign email does not match REKLAIM', () => {
    const match = pickBestPartnershipMatch(
      {
        subject: 'New campaigns on ShopMy this week',
        bodyText: 'Browse new affiliate campaigns from top brands.',
        senderEmail: 'campaigns@shopmy.us',
        senderDomain: 'shopmy.us',
        gmailThreadId: 'thread-shopmy-3',
      },
      [{ partnershipId: 'reklaim-id', fingerprints: REKLAIM_FINGERPRINTS }],
    );
    assert.equal(match, null);
  });

  it('5. existing linked Gmail thread gets strong matching priority', () => {
    const result = scoreEmailAgainstPartnership(
      {
        subject: 'Following up',
        bodyText: 'Just checking in on next steps.',
        senderEmail: 'partnerships@reklaim.com',
        senderDomain: 'reklaim.com',
        gmailThreadId: 'thread-linked',
        linkedPartnershipIds: ['reklaim-id'],
      },
      'reklaim-id',
      REKLAIM_FINGERPRINTS,
    );
    assert.ok(result);
    assert.ok(result!.confidence >= 0.5);
    assert.match(result!.matchedOn, /thread/i);
  });

  it('6. low-confidence match requires confirmation', () => {
    const result = scoreEmailAgainstPartnership(
      {
        subject: 'Partnership opportunity',
        bodyText: 'We love working with creators in luxury.',
        senderEmail: 'info@example.com',
        senderDomain: 'example.com',
        gmailThreadId: 'thread-low',
      },
      'reklaim-id',
      REKLAIM_FINGERPRINTS,
    );
    assert.equal(result, null);
  });

  it('7. explicit response timing overrides default follow-up timing', () => {
    const receivedAt = new Date('2026-08-09T12:00:00.000Z');
    const followUp = parseFollowUpFromEmail(
      'Thanks for applying. Our team review takes 1-3 business days.',
      receivedAt,
    );
    assert.ok(followUp.getTime() > receivedAt.getTime());
    const defaultFollowUp = parseFollowUpFromEmail('Thanks for applying.', receivedAt);
    assert.ok(followUp.getTime() <= defaultFollowUp.getTime());
  });

  it('8. platform approval never suggests REKLAIM accepted status', () => {
    const inferred = inferEmailActivity({
      subject: 'Your ShopMy application has been approved',
      bodyText: 'You can now use ShopMy. Search for REKLAIM after setup.',
      senderDomain: 'shopmy.us',
      knownBrandNames: ['REKLAIM'],
    });
    assert.equal(inferred.activityType, 'platform_approved');
    assert.equal(sanitizeSuggestedStatus(inferred), null);
  });

  it('9. ShopMy application receipt is platform activity, not brand acceptance', () => {
    const inferred = inferEmailActivity({
      subject: 'Thank you for your ShopMy application',
      bodyText: 'We received your application. Review takes 1-3 business days.',
      senderDomain: 'shopmy.us',
      knownBrandNames: ['REKLAIM'],
    });
    assert.equal(inferred.activityType, 'platform_application_received');
    assert.equal(inferred.entityType, 'platform');
    assert.equal(sanitizeSuggestedStatus(inferred), null);
  });

  it('rejected or confirmed Gmail matches are suppressed on retry', async () => {
    const { shouldSuppressDuplicateActivity } = await import('./activities.js');
    assert.equal(shouldSuppressDuplicateActivity({ confirmationStatus: 'rejected' }), true);
    assert.equal(shouldSuppressDuplicateActivity({ confirmationStatus: 'confirmed' }), true);
    assert.equal(shouldSuppressDuplicateActivity({ confirmationStatus: 'pending' }), false);
    assert.equal(shouldSuppressDuplicateActivity(null), false);
  });

  it('10. Shopify brand account confirmation does not match REKLAIM partnership', () => {
    const body =
      'Welcome to REKLAIM. Customer account confirmation — confirm your account to start shopping authenticated pre-owned jewelry.';
    const intent = classifyEmailIntent({
      subject: 'Customer account confirmation',
      bodyText: body,
      senderDomain: 'shopifyemail.com',
    });
    assert.equal(intent.intent, 'transactional_account');

    const match = pickBestPartnershipMatch(
      {
        subject: 'Customer account confirmation',
        bodyText: body,
        senderEmail: 'noreply@shopifyemail.com',
        senderDomain: 'shopifyemail.com',
        gmailThreadId: 'thread-shopify-reklaim-account',
        intent,
      },
      [{ partnershipId: 'reklaim-id', fingerprints: REKLAIM_FINGERPRINTS }],
    );
    assert.equal(match, null);
  });

  it('11. brand name in transactional template is insufficient for matching', () => {
    const match = scoreEmailAgainstPartnership(
      {
        subject: 'Confirm your account',
        bodyText: 'REKLAIM — please confirm your account to continue.',
        senderEmail: 'noreply@shopifyemail.com',
        senderDomain: 'shopifyemail.com',
        gmailThreadId: 'thread-brand-boilerplate',
        intent: classifyEmailIntent({
          subject: 'Confirm your account',
          bodyText: 'REKLAIM — please confirm your account to continue.',
          senderDomain: 'shopifyemail.com',
        }),
      },
      'reklaim-id',
      REKLAIM_FINGERPRINTS,
    );
    assert.equal(match, null);
  });

  it('12. email verification does not enter creator partnership matching', () => {
    const intent = classifyEmailIntent({
      subject: 'Email address verification',
      bodyText: 'Verify your email address for MyyShop.',
      senderDomain: 'myyshop.com',
    });
    assert.equal(intent.intent, 'security_auth');

    const match = pickBestPartnershipMatch(
      {
        subject: 'Email address verification',
        bodyText: 'Verify your email address for MyyShop.',
        senderEmail: 'noreply@myyshop.com',
        senderDomain: 'myyshop.com',
        gmailThreadId: 'thread-myyshop-verify',
        intent,
      },
      [{ partnershipId: 'reklaim-id', fingerprints: REKLAIM_FINGERPRINTS }],
    );
    assert.equal(match, null);
  });

  it('13. order/shipping mail from a retailer does not match creator partnership', () => {
    const intent = classifyEmailIntent({
      subject: 'Your order has shipped',
      bodyText: 'Jared order number 998877 — shipping confirmation and delivery estimate.',
      senderDomain: 'jared.com',
    });
    assert.equal(intent.intent, 'commerce_transactional');

    const match = pickBestPartnershipMatch(
      {
        subject: 'Your order has shipped',
        bodyText: 'Jared order number 998877 — shipping confirmation and delivery estimate.',
        senderEmail: 'orders@jared.com',
        senderDomain: 'jared.com',
        gmailThreadId: 'thread-jared-shipping',
        intent,
      },
      [{ partnershipId: 'reklaim-id', fingerprints: REKLAIM_FINGERPRINTS }],
    );
    assert.equal(match, null);
  });

  it('14. business-day follow-up snaps to local business hour instead of email clock time', () => {
    const receivedAt = new Date('2026-08-09T08:19:54.000Z');
    const followUp = parseFollowUpFromEmail(
      'Thanks for applying. Our team review takes 1-3 business days.',
      receivedAt,
    );
    const snapped = snapToBusinessReminderHour(followUp, 'America/Chicago', 9);
    assert.equal(followUp.toISOString(), snapped.toISOString());
    assert.equal(localHourChicago(followUp), 9);
    assert.notEqual(followUp.getUTCHours(), 8);
  });
});

function localHourChicago(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(date),
  );
}
