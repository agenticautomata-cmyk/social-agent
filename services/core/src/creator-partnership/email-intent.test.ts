import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEmailIntent,
  hasCreatorBusinessContext,
  shouldAllowPlatformMatching,
  shouldBlockPartnershipMatching,
} from './email-intent.js';

describe('email intent classification', () => {
  it('ShopMy application is platform_creator', () => {
    const result = classifyEmailIntent({
      subject: 'Thank you for your ShopMy application',
      bodyText: 'We received your application. Review takes 1-3 business days.',
      senderDomain: 'shopmy.us',
    });
    assert.equal(result.intent, 'platform_creator');
    assert.ok(shouldAllowPlatformMatching(result));
    assert.ok(shouldBlockPartnershipMatching(result, undefined));
  });

  it('Conscious Collective welcome is creator_business', () => {
    const result = classifyEmailIntent({
      subject: 'Welcome to the Conscious Collective',
      bodyText: 'Congratulations — you are accepted into the Conscious Collective creator program for REKLAIM.',
      senderDomain: 'reklaim.com',
    });
    assert.equal(result.intent, 'creator_business');
    assert.ok(!shouldBlockPartnershipMatching(result, undefined));
  });

  it('Shopify customer account confirmation is transactional_account', () => {
    const result = classifyEmailIntent({
      subject: 'Customer account confirmation',
      bodyText: 'Welcome to REKLAIM. Confirm your customer account to shop authenticated pre-owned jewelry.',
      senderDomain: 'shopifyemail.com',
    });
    assert.equal(result.intent, 'transactional_account');
    assert.ok(shouldBlockPartnershipMatching(result, undefined));
  });

  it('email address verification is security_auth', () => {
    const result = classifyEmailIntent({
      subject: 'Email address verification',
      bodyText: 'Verify your email address to activate your MyyShop account.',
      senderDomain: 'myyshop.com',
    });
    assert.equal(result.intent, 'security_auth');
    assert.ok(shouldBlockPartnershipMatching(result, undefined));
  });

  it('order shipped is commerce_transactional', () => {
    const result = classifyEmailIntent({
      subject: 'Your order has shipped',
      bodyText: 'Order number 12345 from Jared is on the way.',
      senderDomain: 'jared.com',
    });
    assert.equal(result.intent, 'commerce_transactional');
    assert.ok(shouldBlockPartnershipMatching(result, undefined));
  });

  it('linked thread bypasses transactional partnership block', () => {
    const result = classifyEmailIntent({
      subject: 'Customer account confirmation',
      bodyText: 'Confirm your account.',
      senderDomain: 'shopifyemail.com',
    });
    assert.ok(!shouldBlockPartnershipMatching(result, ['reklaim-id']));
  });

  it('brand-only mention lacks creator business context', () => {
    assert.equal(
      hasCreatorBusinessContext('Customer account confirmation for REKLAIM shoppers.'),
      false,
    );
    assert.equal(
      hasCreatorBusinessContext('Your REKLAIM storefront on ShopMy is ready for creators.'),
      true,
    );
  });
});
