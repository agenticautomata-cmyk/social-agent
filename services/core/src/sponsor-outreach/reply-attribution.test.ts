/**
 * Reply attribution.
 *
 * The cases that matter most are the negative ones. Every inbound message in live data
 * is platform mail, and a matcher that binds any of it to a pitch would put "a business
 * replied" on Kellie's desk when no business has replied at all.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { domainOfEmail, isNeverAReply, matchReplyToPitch } from './reply-attribution.js';

const CROSSROADS = {
  id: 'email-crossroads',
  to_email: 'media@crossroadshotelkc.com',
  gmail_thread_id: 'thread-abc',
  business_name: 'Crossroads Hotel',
  opportunity_id: 'opp-crossroads',
  opportunity_business_key: 'crossroads-hotel',
};

const RAPHAEL = {
  id: 'email-raphael',
  to_email: 'info@raphaelkc.com',
  gmail_thread_id: 'thread-xyz',
  business_name: 'The Raphael Hotel',
  opportunity_id: 'opp-raphael',
  opportunity_business_key: 'raphael-hotel',
};

const PITCHES = [CROSSROADS, RAPHAEL];

describe('reply attribution', () => {
  it('binds a reply in the same thread', () => {
    const match = matchReplyToPitch({
      fromEmail: 'media@crossroadshotelkc.com',
      subject: 'Re: Art-hotel staycation collaboration',
      threadId: 'thread-abc',
      pitches: PITCHES,
    });
    assert.equal(match?.outreachEmailId, 'email-crossroads');
    assert.equal(match?.method, 'thread');
    assert.equal(match?.partnershipOpportunityId, 'opp-crossroads');
  });

  it('binds a reply from the exact address pitched even on a new thread', () => {
    const match = matchReplyToPitch({
      fromEmail: 'media@crossroadshotelkc.com',
      subject: 'following up on your note',
      threadId: 'some-unrelated-thread',
      pitches: PITCHES,
    });
    assert.equal(match?.method, 'sender_exact');
    assert.equal(match?.outreachEmailId, 'email-crossroads');
  });

  it('binds a colleague at the pitched domain and says so plainly', () => {
    // The common real case: you write to media@, the marketing director answers.
    const match = matchReplyToPitch({
      fromEmail: 'jordan.reese@crossroadshotelkc.com',
      fromName: 'Jordan Reese',
      subject: 'Re: Art-hotel staycation collaboration',
      threadId: null,
      pitches: PITCHES,
    });
    assert.equal(match?.method, 'sender_domain');
    assert.equal(match?.outreachEmailId, 'email-crossroads');
    assert.match(match?.confidenceNote ?? '', /different person than the one addressed/);
  });

  it('keeps the reply bound to the right business when two hotels are pitched', () => {
    const match = matchReplyToPitch({
      fromEmail: 'events@raphaelkc.com',
      subject: 'Re: partnership',
      threadId: null,
      pitches: PITCHES,
    });
    assert.equal(match?.outreachEmailId, 'email-raphael');
    assert.equal(match?.partnershipOpportunityId, 'opp-raphael');
  });

  it('refuses to match on a free mail domain', () => {
    // Two businesses using gmail.com are not the same business.
    const match = matchReplyToPitch({
      fromEmail: 'someone@gmail.com',
      subject: 'Re: partnership',
      threadId: null,
      pitches: [{ ...CROSSROADS, to_email: 'manager@gmail.com' }],
    });
    assert.equal(match, null);
  });

  it('leaves every live inbound message unbound', () => {
    // These are the actual senders in the database. All of them must stay unbound,
    // because none of them is answering a pitch.
    const live = [
      'hello@shopmy.us',
      'info@e.scheels.com',
      'affiliate@scheels.com',
      'store+72540127540@g.shopifyemail.com',
      'welcome@myyshop.com',
      'elemiere@foxrc.com',
    ];
    for (const fromEmail of live) {
      const match = matchReplyToPitch({
        fromEmail,
        subject: 'This week at ShopMy',
        threadId: null,
        pitches: PITCHES,
      });
      assert.equal(match, null, `${fromEmail} must not be bound to a pitch`);
    }
  });

  it('rejects bulk mail carrying an unsubscribe header', () => {
    assert.equal(
      isNeverAReply({
        fromEmail: 'marketing@crossroadshotelkc.com',
        listUnsubscribe: '<https://example.com/u/1>',
      }),
      true,
    );
  });

  it('rejects no-reply senders', () => {
    assert.equal(isNeverAReply({ fromEmail: 'no-reply@crossroadshotelkc.com' }), true);
    assert.equal(isNeverAReply({ fromEmail: 'noreply@crossroadshotelkc.com' }), true);
    assert.equal(isNeverAReply({ fromEmail: 'mailer-daemon@crossroadshotelkc.com' }), true);
  });

  it('does not bind a stranger naming the business in a fresh subject', () => {
    // A weak signal on its own is not attribution. Without "Re:" this stays unbound.
    const match = matchReplyToPitch({
      fromEmail: 'sales@someagency.com',
      subject: 'Crossroads Hotel marketing services',
      threadId: null,
      pitches: PITCHES,
    });
    assert.equal(match, null);
  });

  it('flags a business-key match as needing confirmation', () => {
    const match = matchReplyToPitch({
      fromEmail: 'gm@crossroadshotelgroup.net',
      subject: 'Re: Crossroads Hotel collaboration',
      threadId: null,
      pitches: PITCHES,
    });
    assert.equal(match?.method, 'business_key');
    assert.match(match?.confidenceNote ?? '', /Worth confirming/);
  });

  it('returns nothing when Benson has sent nothing', () => {
    const match = matchReplyToPitch({
      fromEmail: 'media@crossroadshotelkc.com',
      subject: 'Re: hello',
      threadId: 'thread-abc',
      pitches: [],
    });
    assert.equal(match, null);
  });

  it('reads the domain off an address', () => {
    assert.equal(domainOfEmail('Media@CrossroadsHotelKC.com'), 'crossroadshotelkc.com');
    assert.equal(domainOfEmail('not-an-email'), null);
    assert.equal(domainOfEmail(null), null);
  });
});
