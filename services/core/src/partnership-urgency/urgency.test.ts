import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  URGENT_DEADLINE_HOURS,
  classifyUrgency,
  urgencyReasonLabel,
  type PartnershipEvent,
} from './classify.js';
import { formatUrgentAlert, sanitizeForOperator, urgentEventKey } from './message.js';

const NOW = new Date('2026-09-03T12:00:00Z');

function event(overrides: Partial<PartnershipEvent> = {}): PartnershipEvent {
  return {
    kind: 'inbound_reply',
    businessName: 'Crossroads Hotel',
    boundToOutreach: true,
    contactEvidenceState: 'verified_role_inbox',
    deadlineAt: null,
    subject: null,
    bodyText: null,
    approved: false,
    resolved: false,
    now: NOW,
    ...overrides,
  };
}

function hoursFromNow(hours: number): string {
  return new Date(NOW.getTime() + hours * 3_600_000).toISOString();
}

describe('what counts as urgent', () => {
  it('a hotel reply asking about rates is urgent', () => {
    const verdict = classifyUrgency(
      event({
        subject: 'Re: Filming the Second Company Showcase on Sept 5th',
        bodyText:
          'Thanks for reaching out. What are your rates for something like this, and would you want the room comped as well?',
      }),
    );
    assert.equal(verdict.urgent, true);
    if (verdict.urgent) assert.equal(verdict.reason, 'negotiation_open');
  });

  it('a reply proposing a date is urgent before the date is given away', () => {
    const verdict = classifyUrgency(
      event({
        subject: 'Re: Second Company Showcase',
        bodyText: 'We could host you Friday September 5 if that works.',
      }),
    );
    assert.equal(verdict.urgent, true);
    if (verdict.urgent) assert.equal(verdict.reason, 'date_needs_confirmation');
  });

  it('a reply with a stated deadline is urgent', () => {
    const verdict = classifyUrgency(
      event({ subject: 'Re: stay', bodyText: 'Please RSVP by Thursday as the offer expires.' }),
    );
    assert.equal(verdict.urgent, true);
    if (verdict.urgent) assert.equal(verdict.reason, 'offer_expiring');
  });

  it('a reply asking a direct question is urgent', () => {
    const verdict = classifyUrgency(
      event({ subject: 'Re: stay', bodyText: 'Interesting — are you available at all soon?' }),
    );
    assert.equal(verdict.urgent, true);
    if (verdict.urgent) assert.equal(verdict.reason, 'business_reply_needs_decision');
  });

  it('an approved email that failed to send is urgent', () => {
    const verdict = classifyUrgency(event({ kind: 'send_failure', approved: true }));
    assert.equal(verdict.urgent, true);
    if (verdict.urgent) assert.equal(verdict.reason, 'approved_send_failed');
    assert.match(verdict.because, /never received it/);
  });

  it('a verified opportunity closing within three days is urgent', () => {
    const verdict = classifyUrgency(
      event({
        kind: 'new_lead',
        contactEvidenceState: 'verified_role_inbox',
        deadlineAt: hoursFromNow(URGENT_DEADLINE_HOURS - 12),
      }),
    );
    assert.equal(verdict.urgent, true);
    if (verdict.urgent) assert.equal(verdict.reason, 'short_window_opportunity');
  });

  it('a commitment due within three days is urgent', () => {
    const verdict = classifyUrgency(
      event({ kind: 'scheduled_commitment', deadlineAt: hoursFromNow(20) }),
    );
    assert.equal(verdict.urgent, true);
    if (verdict.urgent) assert.equal(verdict.reason, 'commitment_at_risk');
  });
});

describe('what must never be urgent', () => {
  it('a routine new lead is not urgent however good it looks', () => {
    const verdict = classifyUrgency(event({ kind: 'new_lead', deadlineAt: null }));
    assert.equal(verdict.urgent, false);
    assert.match(verdict.because, /still be there tomorrow/);
  });

  it('a Ross Stores promotion is not urgent', () => {
    // This is the actual content of the recent digests: retail marketing.
    const verdict = classifyUrgency(
      event({ subject: 'Ross Stores — 50% off this weekend only', bodyText: 'Shop now! Unsubscribe' }),
    );
    assert.equal(verdict.urgent, false);
    assert.match(verdict.because, /marketing or coupon mail/);
  });

  it("a Minsky's coupon is not urgent even with a deadline in it", () => {
    const verdict = classifyUrgency(
      event({
        subject: "Minsky's Pizza coupon — expires Friday",
        bodyText: 'Use this coupon by Friday. Let us know if you have questions.',
      }),
    );
    assert.equal(verdict.urgent, false);
  });

  it('a tight deadline with no verified contact is not urgent', () => {
    // Nothing is actionable, so interrupting Kellie achieves nothing.
    const verdict = classifyUrgency(
      event({
        kind: 'new_lead',
        contactEvidenceState: 'inferred_unverified',
        deadlineAt: hoursFromNow(24),
      }),
    );
    assert.equal(verdict.urgent, false);
    assert.match(verdict.because, /no verified contact/);
  });

  it('an unlinked inbound message is not treated as a business reply', () => {
    // All 14 inbound messages in live data are unbound newsletters. Treating them as
    // replies is how a "0 replies" system produces urgent alerts about ShopMy.
    const verdict = classifyUrgency(
      event({
        kind: 'inbound_unmatched',
        boundToOutreach: false,
        subject: 'This week at ShopMy',
        bodyText: 'Let us know what you think!',
      }),
    );
    assert.equal(verdict.urgent, false);
    assert.match(verdict.because, /not linked to a pitch/);
  });

  it('an ordinary follow-up is not urgent', () => {
    const verdict = classifyUrgency(event({ kind: 'follow_up_due' }));
    assert.equal(verdict.urgent, false);
  });

  it('a reply that asks for nothing is not urgent', () => {
    const verdict = classifyUrgency(
      event({ subject: 'Re: stay', bodyText: 'Thanks, passing this to our team.' }),
    );
    assert.equal(verdict.urgent, false);
  });

  it('a resolved item leaves urgent', () => {
    const verdict = classifyUrgency(
      event({
        resolved: true,
        subject: 'Re: stay',
        bodyText: 'What are your rates?',
      }),
    );
    assert.equal(verdict.urgent, false);
    assert.match(verdict.because, /already been dealt with/);
  });

  it('a send failure that was never approved is not urgent', () => {
    const verdict = classifyUrgency(event({ kind: 'send_failure', approved: false }));
    assert.equal(verdict.urgent, false);
  });
});

describe('duplicate events do not produce duplicate alerts', () => {
  it('builds the same key for the same event', () => {
    const args = {
      reason: 'negotiation_open' as const,
      businessKey: 'crossroads-hotel',
      inboundMessageId: 'abc',
    };
    assert.equal(urgentEventKey(args), urgentEventKey({ ...args }));
  });

  it('builds different keys for different reasons on the same message', () => {
    assert.notEqual(
      urgentEventKey({
        reason: 'negotiation_open',
        businessKey: 'crossroads-hotel',
        inboundMessageId: 'abc',
      }),
      urgentEventKey({
        reason: 'offer_expiring',
        businessKey: 'crossroads-hotel',
        inboundMessageId: 'abc',
      }),
    );
  });

  it('does not include a timestamp, so a re-run matches', () => {
    const key = urgentEventKey({
      reason: 'negotiation_open',
      businessKey: 'crossroads-hotel',
      inboundMessageId: 'abc',
    });
    assert.doesNotMatch(key, /\d{4}-\d{2}-\d{2}/);
  });
});

describe('the alert Kellie actually reads', () => {
  const content = {
    reason: 'negotiation_open' as const,
    businessName: 'Crossroads Hotel',
    opportunity: 'Hosted stay around the Sept 5 Second Company Showcase',
    whatChanged: 'They asked what your rates are and whether the room should be comped.',
    compensationSummary: 'Requesting fully hosted: one complimentary night and a dining credit',
    deadlineAt: '2026-09-05T23:00:00Z',
    deadlineTimezone: 'America/Chicago',
    contactEvidenceState: 'verified_role_inbox' as const,
    recommendedAction: 'Reply with your rate for one video plus stories, and confirm Sept 5.',
    deepLink: 'https://benson.kckellie.com/email/approvals?pitch=crossroads-hotel',
  };

  it('states business, change, compensation, deadline, contact, action and link', () => {
    const message = formatUrgentAlert(content);
    assert.match(message, /Crossroads Hotel/);
    assert.match(message, /What changed:/);
    assert.match(message, /Compensation:/);
    assert.match(message, /By: /);
    assert.match(message, /Contact: Verified media or partnerships inbox/);
    assert.match(message, /Do this:/);
    assert.match(message, /https:\/\/benson\.kckellie\.com/);
  });

  it('names the timezone, because "by 5pm" is ambiguous', () => {
    const message = formatUrgentAlert(content);
    assert.match(message, /\b(?:CDT|CST)\b/);
  });

  it('leads with the reason in plain language', () => {
    const message = formatUrgentAlert(content);
    assert.ok(message.startsWith('\u{1F534} '));
    assert.match(message, new RegExp(urgencyReasonLabel('negotiation_open')));
  });

  it('links to the approval page rather than offering a one-tap send', () => {
    const message = formatUrgentAlert(content);
    assert.match(message, /\/email\/approvals/);
    assert.doesNotMatch(message, /send now|tap to send/i);
  });

  it('never leaks a UUID', () => {
    const message = formatUrgentAlert({
      ...content,
      whatChanged: 'Reply on 7300ff2a-e214-421b-8da9-39ceab2c2158 needs a decision.',
    });
    assert.doesNotMatch(
      message,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('never leaks a filesystem path or a stack frame', () => {
    const cleaned = sanitizeForOperator(
      'ENOENT: /home/elliott/Projects/kellie-assistant/social-agent/tmp/x.json at readFile (node:fs/promises:1)',
    );
    assert.doesNotMatch(cleaned, /\/home\//);
    assert.doesNotMatch(cleaned, /at readFile/);
  });

  it('omits compensation and deadline lines when there is nothing to say', () => {
    const message = formatUrgentAlert({
      ...content,
      compensationSummary: null,
      deadlineAt: null,
    });
    assert.doesNotMatch(message, /Compensation:/);
    assert.doesNotMatch(message, /^By: /m);
  });
});
