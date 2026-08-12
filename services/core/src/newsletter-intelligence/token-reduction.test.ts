import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prefilterNewsletterEmail } from './prefilter.js';
import { reduceNewsletterContent } from './content-reducer.js';
import { assertOutcomeTotalsMatchSample } from './outcomes.js';

describe('outcome accounting', () => {
  it('requires mutually exclusive primary outcomes to sum to sample size', () => {
    assertOutcomeTotalsMatchSample(
      {
        rejected_pre_llm: 2,
        cache_hit: 3,
        llm_extracted: 1,
        provider_blocked: 0,
        extraction_failed: 0,
      },
      6,
    );
    assert.throws(() =>
      assertOutcomeTotalsMatchSample(
        {
          rejected_pre_llm: 2,
          cache_hit: 3,
          llm_extracted: 1,
          provider_blocked: 0,
          extraction_failed: 0,
        },
        7,
      ),
    );
  });
});

describe('prefilterNewsletterEmail', () => {
  it('rejects order confirmations with zero tokens', () => {
    const result = prefilterNewsletterEmail({
      gmailMessageId: 'msg-order-1',
      subject: 'Your order confirmation #9912',
      bodyText: 'Thank you for your purchase. Track your package.',
      bodyHtml: '',
      senderEmail: 'orders@target.com',
      urls: [],
      newsletterCategory: 'retail_newsletter',
      persistReject: false,
    });
    assert.equal(result.pass, false);
    if (result.pass) return;
    assert.equal(result.reason, 'account_order_notice');
  });

  it('rejects national retail percent-off without KC evidence', () => {
    const result = prefilterNewsletterEmail({
      gmailMessageId: 'msg-retail-1',
      subject: '40% off everything sitewide',
      bodyText: 'Shop the sale. Free shipping on orders over $50. New arrivals inside.',
      bodyHtml: '',
      senderEmail: 'deals@target.com',
      urls: ['https://www.target.com/sale'],
      newsletterCategory: 'retail_newsletter',
      persistReject: false,
    });
    assert.equal(result.pass, false);
  });

  it('passes KC event roundup signals', () => {
    const result = prefilterNewsletterEmail({
      gmailMessageId: 'msg-event-1',
      subject: 'KC events this weekend',
      bodyText:
        'Kansas City concerts and festivals this Friday and Saturday. Tickets on sale at the Midland.',
      bodyHtml: '',
      senderEmail: 'events@visitkc.com',
      urls: ['https://visitkc.com/events'],
      newsletterCategory: 'tourism_community_roundup',
      persistReject: false,
    });
    assert.equal(result.pass, true);
  });

  it('rejects vague teaser promotions', () => {
    const result = prefilterNewsletterEmail({
      gmailMessageId: 'msg-vague-1',
      subject: 'Something exciting is coming soon',
      bodyText: 'Stay tuned for big news. You do not want to miss this.',
      bodyHtml: '',
      senderEmail: 'promo@randombrand.com',
      urls: [],
      newsletterCategory: 'retail_newsletter',
      persistReject: false,
    });
    assert.equal(result.pass, false);
  });

  it('rejects marshalls clearance promos via events_only sender policy', () => {
    const result = prefilterNewsletterEmail({
      gmailMessageId: 'msg-marshalls-1',
      subject: 'HURRY! Clearance is almost gone',
      bodyText: 'Shop clearance before it is gone.',
      bodyHtml: '',
      senderEmail: 'marshalls@eml.marshalls.com',
      urls: ['https://www.marshalls.com/clearance'],
      newsletterCategory: 'retail_newsletter',
      persistReject: false,
    });
    assert.equal(result.pass, false);
  });
});

describe('reduceNewsletterContent', () => {
  it('shrinks HTML newsletters and keeps event paragraphs', () => {
    const junk = 'Shop now. 40% off. Free shipping. '.repeat(20);
    const html = `
      <html><body>
        <nav>Home | Shop | Unsubscribe</nav>
        ${junk}
        <p>Live music at Joe's Kansas City BBQ this Friday 7pm. Free admission.</p>
        <p>123 Main St, Kansas City, MO</p>
        <footer>Unsubscribe privacy policy view in browser</footer>
      </body></html>`;
    const { text, report } = reduceNewsletterContent({
      subject: 'Weekend in KC',
      bodyText: '',
      bodyHtml: html,
      hardLimitChars: 2000,
    });
    assert.ok(report.estimatedReducedTokens <= report.estimatedOriginalTokens);
    assert.ok(report.reducedChars <= report.originalChars + 40);
    assert.match(text, /Kansas City|Joe's/i);
    assert.doesNotMatch(text, /unsubscribe/i);
  });
});
