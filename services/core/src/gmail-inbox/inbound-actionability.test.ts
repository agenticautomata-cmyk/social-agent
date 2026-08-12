import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isReplyActionable, resolveInboundActionability } from './inbound-actionability.js';

describe('resolveInboundActionability', () => {
  it('MyyShop verification is non-actionable', () => {
    const result = resolveInboundActionability({
      subject: 'Email address verification',
      bodyText: 'Verify your email address to activate your MyyShop account.',
      senderDomain: 'myyshop.com',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.emailIntent, 'security_auth');
    assert.equal(result.actionability, 'none');
    assert.equal(isReplyActionable(result.actionability), false);
  });

  it('REKLAIM customer account confirmation is non-actionable', () => {
    const result = resolveInboundActionability({
      subject: 'Customer account confirmation',
      bodyText: 'Welcome to REKLAIM. Confirm your customer account to shop authenticated pre-owned jewelry.',
      senderDomain: 'shopifyemail.com',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.emailIntent, 'transactional_account');
    assert.equal(result.actionability, 'none');
  });

  it('ShopMy application receipt waits for follow-up, not immediate reply', () => {
    const result = resolveInboundActionability({
      subject: 'Thank you for your ShopMy application',
      bodyText: 'We received your application. Review takes 1-3 business days.',
      senderDomain: 'shopmy.us',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.emailIntent, 'platform_creator');
    assert.equal(result.actionability, 'waiting_followup');
    assert.equal(isReplyActionable(result.actionability), false);
  });

  it('ShopMy You’re in! acceptance is not reply_required', () => {
    const result = resolveInboundActionability({
      subject: "You're in!",
      bodyText: 'Welcome to ShopMy — The ShopMy Team. Your application was accepted.',
      senderDomain: 'shopmy.us',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.emailIntent, 'platform_creator');
    assert.equal(result.actionability, 'waiting_followup');
    assert.equal(isReplyActionable(result.actionability), false);
  });

  it('SCHEELS-style pending creator application waits for follow-up', () => {
    const result = resolveInboundActionability({
      subject: 'Your application is pending!',
      bodyText:
        "Thanks for applying to our creator program. We're reviewing your application and will contact you.",
      senderDomain: 'creator-program.example',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.emailIntent, 'creator_business');
    assert.equal(result.actionability, 'waiting_followup');
    assert.equal(isReplyActionable(result.actionability), false);
  });

  it('creator-business FYI on a known thread stays non-actionable without a response request', () => {
    const result = resolveInboundActionability({
      subject: 'Re: Creator campaign',
      bodyText: 'FYI: the campaign launch moved to next week.',
      senderDomain: 'brand.example',
      matchKind: 'outreach_reply',
      outreachEmailId: 'pitch-email-id',
      verifiedOutreachThread: true,
    });
    assert.equal(result.emailIntent, 'creator_business');
    assert.equal(result.actionability, 'none');
  });

  it('generic creator application pending email waits for follow-up', () => {
    const result = resolveInboundActionability({
      subject: 'Creator program application pending',
      bodyText: "We received your application. We'll reach out after our review.",
      senderDomain: 'program.example',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.emailIntent, 'creator_business');
    assert.equal(result.actionability, 'waiting_followup');
  });

  it('creator-business response asking a question requires reply', () => {
    const result = resolveInboundActionability({
      subject: 'Creator partnership details',
      bodyText: 'Could you share your rates and available campaign dates?',
      senderDomain: 'brand.example',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.emailIntent, 'creator_business');
    assert.equal(result.actionability, 'reply_required');
  });

  it('creator-business informational FYI without response request is not reply_required', () => {
    const result = resolveInboundActionability({
      subject: 'Creator campaign update',
      bodyText: 'FYI: the creator campaign brief will be published next week. No response is required.',
      senderDomain: 'brand.example',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.emailIntent, 'creator_business');
    assert.equal(result.actionability, 'none');
    assert.equal(isReplyActionable(result.actionability), false);
  });

  it('genuine sponsor reply on known thread is reply_required', () => {
    const result = resolveInboundActionability({
      subject: 'Re: Partnership opportunity',
      bodyText: 'Thanks for reaching out — we would love to discuss a creator partnership.',
      senderDomain: 'brand.com',
      matchKind: 'outreach_reply',
      outreachEmailId: 'pitch-email-id',
      verifiedOutreachThread: true,
    });
    assert.equal(result.actionability, 'reply_required');
  });

  it('vague short reply on known sponsor thread remains actionable', () => {
    const result = resolveInboundActionability({
      subject: 'Re: Hello',
      bodyText: 'Yes',
      senderDomain: 'brand.com',
      matchKind: 'outreach_reply',
      outreachEmailId: 'pitch-email-id',
      verifiedOutreachThread: true,
    });
    assert.equal(result.actionability, 'reply_required');
  });

  it('blocked transactional message on known thread remains blocked', () => {
    const result = resolveInboundActionability({
      subject: 'Customer account confirmation',
      bodyText: 'Confirm your account.',
      senderDomain: 'shopifyemail.com',
      matchKind: 'outreach_reply',
      outreachEmailId: 'pitch-email-id',
      verifiedOutreachThread: true,
    });
    assert.equal(result.emailIntent, 'transactional_account');
    assert.equal(result.actionability, 'none');
  });

  it('unthreaded sponsors@ mail without creator evidence is non-actionable', () => {
    const result = resolveInboundActionability({
      subject: 'Your order has shipped',
      bodyText: 'Order number 12345 is on the way.',
      senderDomain: 'store.com',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(result.actionability, 'none');
  });
});
