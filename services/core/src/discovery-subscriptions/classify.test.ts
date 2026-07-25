import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDiscoveryEmail,
  isBlockedConfirmationEmail,
  looksLikeSubscriptionConfirmation,
} from './classify.js';

describe('classifyDiscoveryEmail', () => {
  it('detects common confirmation subjects', () => {
    for (const subject of [
      'Confirm your subscription to KC Events',
      'Verify your email address',
      'Complete your signup for Brookside alerts',
      'Activate your subscription',
      'Please confirm your registration',
    ]) {
      const result = classifyDiscoveryEmail({ subject, bodyText: 'Click to confirm.' });
      assert.equal(result.kind, 'discovery_subscription_confirmation');
    }
  });

  it('detects confirmation bodies and HTML buttons', () => {
    const result = classifyDiscoveryEmail({
      subject: 'KC newsletter',
      bodyText: 'Confirm your subscription by clicking below.',
      bodyHtml: '<a href="https://news.example.com/confirm?token=abc">Confirm</a>',
    });
    assert.equal(result.kind, 'discovery_subscription_confirmation');
  });

  it('routes password reset emails to manual review', () => {
    const result = classifyDiscoveryEmail({
      subject: 'Reset your password',
      bodyText: 'Click here to reset your password.',
    });
    assert.equal(result.kind, 'discovery_subscription_confirmation');
    assert.equal(result.requiresManualReview, true);
  });

  it('routes payment confirmations to manual review', () => {
    assert.ok(isBlockedConfirmationEmail({ subject: 'Payment confirmation', bodyText: 'Your order' }));
    assert.ok(isBlockedConfirmationEmail({ subject: 'Confirm', bodyText: 'OAuth authorize access' }));
  });

  it('treats ordinary newsletters as opportunity signals', () => {
    const result = classifyDiscoveryEmail({
      subject: 'This weekend in Kansas City',
      bodyText: 'New restaurant opening Saturday in Crossroads.',
    });
    assert.equal(result.kind, 'opportunity_signal');
  });

  it('detects verification code language', () => {
    assert.ok(
      looksLikeSubscriptionConfirmation({
        subject: 'Your code',
        bodyText: 'Enter this verification code: 482913',
      }),
    );
  });
});
