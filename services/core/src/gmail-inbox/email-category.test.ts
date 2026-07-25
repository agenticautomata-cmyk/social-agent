import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInboundEmail,
  classifyDiscoveryIntent,
  formatTelegramDigestBody,
  subscriptionConfirmationTelegramStatus,
  telegramHeadingForCategory,
} from './email-category.js';
import { getChannelEmail } from '../creator-info/channels.js';

function headers(map: Record<string, string>) {
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

describe('alias routing to categories', () => {
  it('routes discoveries@ to discovery', () => {
    const result = classifyInboundEmail({
      headers: headers({ 'Delivered-To': 'discoveries@kckellie.com' }),
      subject: 'Welcome to KCUR',
      bodyText: 'Thanks for subscribing',
    });
    assert.equal(result.emailCategory, 'discovery');
    assert.equal(result.channelId, 'discoveries');
  });

  it('routes each kckellie alias to the correct category', () => {
    const cases = [
      ['sponsors@kckellie.com', 'sponsor', 'sponsors'],
      ['collabs@kckellie.com', 'collaboration', 'collabs'],
      ['booking@kckellie.com', 'booking', 'booking'],
      ['media@kckellie.com', 'media', 'media'],
      ['contact@kckellie.com', 'general_contact', 'contact'],
    ] as const;

    for (const [email, category, channel] of cases) {
      const result = classifyInboundEmail({
        headers: headers({ To: email }),
        subject: 'Hello',
        bodyText: 'Test',
      });
      assert.equal(result.emailCategory, category, email);
      assert.equal(result.channelId, channel, email);
    }
  });

  it('preserves original-recipient classification via Original-Recipient', () => {
    const result = classifyInboundEmail({
      headers: headers({ 'Original-Recipient': 'rfc822;discoveries@kckellie.com' }),
      subject: 'Confirm your subscription',
      bodyText: 'Verify your email',
    });
    assert.equal(result.emailCategory, 'discovery');
    assert.equal(result.inboxFilter, 'subscription_confirmation');
  });

  it('preserves discoveries@ when forwarded into Gmail inbox', () => {
    const result = classifyInboundEmail({
      headers: headers({
        To: 'kckelliecreator@gmail.com',
        'X-Original-To': 'discoveries@kckellie.com',
      }),
      subject: 'Welcome to Visit KC',
      bodyText: 'Thanks for subscribing',
    });
    assert.equal(result.emailCategory, 'discovery');
    assert.notEqual(result.emailCategory, 'sponsor');
    assert.equal(result.originalRecipient, 'discoveries@kckellie.com');
  });

  it('routes sponsors@ to sponsor category', () => {
    const result = classifyInboundEmail({
      headers: headers({ To: 'sponsors@kckellie.com' }),
      subject: 'Partnership inquiry',
      bodyText: 'We would love to sponsor your content',
    });
    assert.equal(result.emailCategory, 'sponsor');
    assert.equal(result.inboxFilter, 'sponsor');
  });
});

describe('discovery intent classification', () => {
  it('classifies subscription confirmations', () => {
    assert.equal(
      classifyDiscoveryIntent({ subject: 'Confirm your subscription to KCUR' }),
      'discovery_subscription_confirmation',
    );
  });

  it('classifies welcome messages separately from confirmations', () => {
    assert.equal(
      classifyDiscoveryIntent({ subject: 'Welcome to The Pitch newsletter', bodyText: 'Thanks for subscribing' }),
      'discovery_subscription_welcome',
    );
  });

  it('classifies announcements as discovery opportunities', () => {
    assert.equal(
      classifyDiscoveryIntent({ subject: 'Grand opening this weekend in Brookside' }),
      'discovery_opportunity',
    );
  });

  it('excludes welcome emails from opportunity pipeline intents', () => {
    const intent = classifyDiscoveryIntent({
      subject: 'Welcome to The Pitch newsletter',
      bodyText: 'Thanks for subscribing',
    });
    assert.equal(intent, 'discovery_subscription_welcome');
    assert.notEqual(intent, 'discovery_opportunity');
  });
});

describe('telegram headings', () => {
  it('uses category-specific headings', () => {
    assert.equal(telegramHeadingForCategory('discovery'), 'Benson · discovery inbox');
    assert.equal(telegramHeadingForCategory('sponsor'), 'Benson · sponsor inbox');
    assert.equal(
      telegramHeadingForCategory('subscription_confirmation'),
      'Benson · subscription confirmation',
    );
  });

  it('builds separate grouped telegram bodies', () => {
    const body = formatTelegramDigestBody({
      category: 'discovery',
      messages: [{ fromName: 'KCUR', subject: 'Confirm your subscription' }],
      summaryText: '• KCUR confirmation waiting',
      inboxUrl: 'https://benson.kckellie.com/email/inbox',
    });
    assert.match(body, /Benson · discovery inbox/);
    assert.doesNotMatch(body, /sponsor inbox/);
  });

  it('produces distinct headings for mixed-category polling batches', () => {
    const batch = [
      classifyInboundEmail({
        headers: headers({ 'Delivered-To': 'discoveries@kckellie.com' }),
        subject: 'Welcome to KCUR',
        bodyText: 'Thanks for subscribing',
      }),
      classifyInboundEmail({
        headers: headers({ To: 'sponsors@kckellie.com' }),
        subject: 'Sponsorship deck attached',
        bodyText: 'Partnership opportunity',
      }),
      classifyInboundEmail({
        headers: headers({ To: 'kckelliecreator@gmail.com' }),
        subject: 'Security alert for your Google Account',
        fromEmail: 'no-reply@accounts.google.com',
        bodyText: 'Suspicious sign-in',
      }),
    ];

    const telegramCategories = batch.map((row) =>
      row.inboxFilter === 'subscription_confirmation' ? 'subscription_confirmation' : row.emailCategory,
    );
    const headings = telegramCategories.map((category) => telegramHeadingForCategory(category));

    assert.equal(new Set(headings).size, 3);
    assert.ok(headings.includes('Benson · discovery inbox'));
    assert.ok(headings.includes('Benson · sponsor inbox'));
    assert.ok(headings.includes('Benson · security alert'));
    assert.doesNotMatch(headings.join('\n'), /sponsor inbox.*discovery inbox/s);
  });

  it('includes verification status on subscription confirmation alerts', () => {
    const body = formatTelegramDigestBody({
      category: 'subscription_confirmation',
      messages: [{ fromName: 'KCUR', subject: 'Confirm your subscription' }],
      summaryText: '• KCUR needs a click',
      inboxUrl: 'https://benson.kckellie.com/email/inbox',
      verificationStatusLine: `Status: ${subscriptionConfirmationTelegramStatus({ status: 'verified' })}`,
    });
    assert.match(body, /Benson · subscription confirmation/);
    assert.match(body, /verified automatically/);
  });
});

describe('security alerts', () => {
  it('routes security alerts separately', () => {
    const result = classifyInboundEmail({
      headers: headers({ To: 'kckelliecreator@gmail.com' }),
      subject: 'Security alert for your Google Account',
      fromEmail: 'no-reply@accounts.google.com',
      bodyText: 'We noticed a suspicious sign-in',
    });
    assert.equal(result.emailCategory, 'security');
    assert.equal(result.inboxFilter, 'security');
  });
});

describe('discoveries env alias', () => {
  it('uses configured discoveries email', () => {
    assert.match(getChannelEmail('discoveries'), /@/);
  });
});

describe('sponsor unread exclusion', () => {
  it('never classifies discoveries@ messages as sponsor', () => {
    const samples = [
      { subject: 'Welcome to The Pitch', bodyText: 'Thanks for subscribing' },
      { subject: 'Confirm your KCUR subscription', bodyText: 'Verify your email' },
      { subject: 'Visit KC event this weekend', bodyText: 'Grand opening announcement' },
    ];

    for (const sample of samples) {
      const result = classifyInboundEmail({
        headers: headers({ 'Delivered-To': 'discoveries@kckellie.com' }),
        ...sample,
      });
      assert.notEqual(result.emailCategory, 'sponsor', sample.subject);
    }
  });
});
