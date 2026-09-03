/**
 * Decides what is genuinely urgent about a partnership.
 *
 * There was no classifier before this. `gmail-inbox/email-category.ts` stamped the
 * heading "SPONSOR inbox — high urgency" on every message that arrived at the sponsor
 * address, which is why 669 Telegram digests went out about Ross Stores, Marshalls and
 * a Minsky's coupon while zero of 437 early signals were ever classified urgent. When
 * everything is urgent, nothing is, and Kellie stops reading.
 *
 * Urgent means: something will be lost if Kellie does not act soon. A new lead is not
 * urgent no matter how good it is — it will still be there tomorrow.
 */

import type { ContactEvidenceState } from '../partnership-contracts/contact-evidence.js';

export const URGENCY_REASONS = [
  /** A business replied and is waiting on a decision. */
  'business_reply_needs_decision',
  /** A stated offer or deadline runs out soon. */
  'offer_expiring',
  /** They proposed a date that has to be confirmed. */
  'date_needs_confirmation',
  /** They asked about money or terms. */
  'negotiation_open',
  /** A verified opportunity whose window is genuinely short. */
  'short_window_opportunity',
  /** Kellie approved it and the send failed. */
  'approved_send_failed',
  /** Something already committed to is about to be missed. */
  'commitment_at_risk',
] as const;

export type UrgencyReason = (typeof URGENCY_REASONS)[number];

const REASON_LABELS: Record<UrgencyReason, string> = {
  business_reply_needs_decision: 'A business replied and is waiting on you',
  offer_expiring: 'An offer is about to expire',
  date_needs_confirmation: 'A proposed date needs confirming',
  negotiation_open: 'They asked about compensation or terms',
  short_window_opportunity: 'A verified opportunity closes soon',
  approved_send_failed: 'An approved email failed to send',
  commitment_at_risk: 'A commitment is at immediate risk',
};

export function urgencyReasonLabel(reason: UrgencyReason): string {
  return REASON_LABELS[reason];
}

/** How soon a deadline has to be before it is worth interrupting Kellie. */
export const URGENT_DEADLINE_HOURS = 72;

/**
 * A partnership event, described in the terms the classifier needs. Deliberately not
 * the raw email or scraper row — nothing here is free text from an unknown source.
 */
export type PartnershipEvent = {
  kind:
    | 'inbound_reply'
    | 'inbound_unmatched'
    | 'new_lead'
    | 'discovery_finding'
    | 'send_failure'
    | 'follow_up_due'
    | 'scheduled_commitment';
  businessName: string | null;
  /** True only when the message is bound to an outreach email Benson actually sent. */
  boundToOutreach: boolean;
  contactEvidenceState: ContactEvidenceState | null;
  /** Deadline in the event's own terms, when one is stated. */
  deadlineAt: string | null;
  /** Subject and body of an inbound message, when there is one. */
  subject: string | null;
  bodyText: string | null;
  /** Whether Kellie has approved the related pitch. */
  approved: boolean;
  /** Whether the item has since been dealt with. */
  resolved: boolean;
  now?: Date;
};

export type UrgencyVerdict =
  | { urgent: true; reason: UrgencyReason; because: string }
  | { urgent: false; because: string };

/** Language that means a person is waiting on an answer. */
const DECISION_PATTERNS = [
  /\bcan you\b/i,
  /\bwould you\b/i,
  /\bare you (?:available|able|interested|free)\b/i,
  /\blet (?:me|us) know\b/i,
  /\bplease (?:confirm|advise|reply|respond)\b/i,
  /\bwhat (?:are|is) your (?:rate|rates|fee|pricing|availability)\b/i,
  /\bdoes (?:that|this) work\b/i,
  /\bwaiting (?:on|for) (?:your|you)\b/i,
];

const DATE_PATTERNS = [
  /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i,
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  /\bnext week\b/i,
  /\bthis (?:week|weekend)\b/i,
  /\bavailable on\b/i,
];

const NEGOTIATION_PATTERNS = [
  /\b(?:rate|rates|fee|fees|budget|compensation|payment|paid|invoice|quote)\b/i,
  /\b(?:comp(?:ed)?|complimentary|hosted|gift card|credit)\b/i,
  /\busage rights?\b/i,
  /\bexclusivity\b/i,
  /\bcontract\b/i,
];

const EXPIRY_PATTERNS = [
  /\bexpires?\b/i,
  /\bdeadline\b/i,
  /\bby (?:end of|eod|cob)\b/i,
  /\blast (?:day|chance)\b/i,
  /\brsvp by\b/i,
  /\bcloses? (?:on|at)\b/i,
];

/**
 * Retail and coupon noise. These arrive at the sponsor address constantly and were the
 * bulk of what Kellie was being pinged about.
 */
const NOISE_PATTERNS = [
  /\b(?:ross|marshalls|minsky'?s|t\.?j\.? ?maxx|homegoods|burlington|kohl'?s)\b/i,
  /\b\d+% off\b/i,
  /\bcoupon\b/i,
  /\bflash sale\b/i,
  /\bshop now\b/i,
  /\bnewsletter\b/i,
  /\bunsubscribe\b/i,
  /\bweekly ad\b/i,
];

function hoursUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return (then - now.getTime()) / 3_600_000;
}

/**
 * The single decision point for urgency.
 *
 * Ordered so the strongest signal wins, and every non-urgent answer explains itself —
 * "not urgent" with no reason is how a real reply gets buried.
 */
export function classifyUrgency(event: PartnershipEvent): UrgencyVerdict {
  const now = event.now ?? new Date();

  // Anything already dealt with leaves urgent, whatever it used to be.
  if (event.resolved) {
    return { urgent: false, because: 'This has already been dealt with.' };
  }

  // An approved email that failed to send is the clearest urgent case: Kellie thinks
  // it went out and it did not.
  if (event.kind === 'send_failure' && event.approved) {
    return {
      urgent: true,
      reason: 'approved_send_failed',
      because: 'You approved this and the send failed, so the business never received it.',
    };
  }

  if (event.kind === 'scheduled_commitment') {
    const hours = hoursUntil(event.deadlineAt, now);
    if (hours !== null && hours <= URGENT_DEADLINE_HOURS && hours > -24) {
      return {
        urgent: true,
        reason: 'commitment_at_risk',
        because: 'Something already agreed is due and is not confirmed as done.',
      };
    }
    return { urgent: false, because: 'The commitment is not due yet.' };
  }

  const blob = `${event.subject ?? ''}\n${event.bodyText ?? ''}`;

  // Marketing mail is never urgent, even when it lands in the sponsor inbox. Checked
  // before the reply logic because a promotional blast can otherwise trip the "let me
  // know" and date patterns.
  if (NOISE_PATTERNS.some((pattern) => pattern.test(blob))) {
    return {
      urgent: false,
      because: 'This is marketing or coupon mail, not a business conversation.',
    };
  }

  if (event.kind === 'inbound_reply' || event.kind === 'inbound_unmatched') {
    // An unbound message is not known to be a reply to anything Benson sent, so it
    // cannot be treated as a business waiting on Kellie.
    if (!event.boundToOutreach) {
      return {
        urgent: false,
        because:
          'This message is not linked to a pitch Benson sent, so Benson cannot tell that a business is waiting on a reply.',
      };
    }

    if (NEGOTIATION_PATTERNS.some((pattern) => pattern.test(blob))) {
      return {
        urgent: true,
        reason: 'negotiation_open',
        because: 'They raised compensation or terms, which needs your answer.',
      };
    }
    if (EXPIRY_PATTERNS.some((pattern) => pattern.test(blob))) {
      return {
        urgent: true,
        reason: 'offer_expiring',
        because: 'They put a deadline on their side of this.',
      };
    }
    if (DATE_PATTERNS.some((pattern) => pattern.test(blob))) {
      return {
        urgent: true,
        reason: 'date_needs_confirmation',
        because: 'They proposed a date that needs confirming before it is given away.',
      };
    }
    if (DECISION_PATTERNS.some((pattern) => pattern.test(blob))) {
      return {
        urgent: true,
        reason: 'business_reply_needs_decision',
        because: 'A business replied and is waiting on a decision from you.',
      };
    }
    return {
      urgent: false,
      because: 'They replied but did not ask for anything, so nothing is waiting on you.',
    };
  }

  if (event.kind === 'new_lead' || event.kind === 'discovery_finding') {
    // The one exception: a verified opportunity whose window closes within days. A
    // strong lead with no deadline still waits until tomorrow.
    const hours = hoursUntil(event.deadlineAt, now);
    const verifiedContact =
      event.contactEvidenceState === 'verified_named_decision_maker' ||
      event.contactEvidenceState === 'verified_role_inbox';

    if (hours !== null && hours > 0 && hours <= URGENT_DEADLINE_HOURS && verifiedContact) {
      return {
        urgent: true,
        reason: 'short_window_opportunity',
        because:
          'This is a verified contact and the moment it depends on happens within three days.',
      };
    }
    if (hours !== null && hours > 0 && hours <= URGENT_DEADLINE_HOURS && !verifiedContact) {
      return {
        urgent: false,
        because:
          'The timing is tight but there is no verified contact, so there is nothing Kellie can action right now.',
      };
    }
    return {
      urgent: false,
      because: 'A new lead is not urgent — it will still be there tomorrow.',
    };
  }

  if (event.kind === 'follow_up_due') {
    return {
      urgent: false,
      because: 'An ordinary follow-up is routine work, not an interruption.',
    };
  }

  return { urgent: false, because: 'Nothing about this needs Kellie today.' };
}
