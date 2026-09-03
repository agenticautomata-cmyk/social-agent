/**
 * Binds an inbound message to the pitch, business and opportunity it answers.
 *
 * The audit reported all 14 inbound messages as unattributed and read that as a
 * broken linkage. It is worth being precise about what is actually true, because the
 * fix is different: those 14 are ShopMy welcome mail, a Scheels affiliate notice, a
 * Shopify account confirmation and a Flower Child friends-and-family invite. None of
 * them answers a pitch, so `NULL` is the correct value for every one. Benson has
 * never received a real reply.
 *
 * What is genuinely missing is reach. Attribution ran on Gmail thread id alone, which
 * only survives if the business replies in the thread Benson started. In practice you
 * pitch `media@hotel.com` and the marketing director answers from her own address on
 * a fresh thread, and thread matching sees nothing. So four methods are tried in
 * descending order of certainty, and the one that succeeded is recorded on the row:
 *
 *   thread        — same Gmail thread. Certain.
 *   sender_exact  — from the address Benson pitched. Certain.
 *   sender_domain — a colleague at the pitched domain. Strong, and stated as such.
 *   business_key  — same business, different domain. Weakest, and only accepted with
 *                   a corroborating signal, because a shared domain across unrelated
 *                   businesses would otherwise bind a reply to the wrong opportunity.
 *
 * Free mail providers are never matched on domain: two hotels using gmail.com are not
 * the same business. When nothing matches, the message stays unbound. An unbound
 * message is an honest state — it means no business is waiting on Kellie — and it is
 * what keeps newsletter traffic off Today and out of the urgent queue.
 */
import { sql } from 'drizzle-orm';

import { db } from '../db.js';
import { businessKeyFor } from '../partnership-contracts/business-key.js';

export type ReplyMatchMethod =
  | 'thread'
  | 'sender_exact'
  | 'sender_domain'
  | 'business_key';

export type ReplyAttribution = {
  outreachEmailId: string;
  partnershipOpportunityId: string | null;
  businessKey: string | null;
  method: ReplyMatchMethod;
  /** Plain-language statement of how sure this is, stored next to the link. */
  confidenceNote: string;
};

/**
 * Domains where a shared suffix proves nothing about shared employers. Matching on
 * these would bind one hotel's reply to another hotel's pitch.
 */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'zoho.com',
]);

/**
 * Senders whose mail is never a reply to a pitch, however it is addressed. These are
 * the platforms that produced every inbound message in live data; matching them on a
 * loose signal is exactly how a newsletter ends up on Kellie's desk as "a business
 * replied".
 */
const NEVER_A_REPLY_DOMAINS = [
  'shopmy.us',
  'shopifyemail.com',
  'myyshop.com',
  'mail.instagram.com',
  'facebookmail.com',
  'linkedin.com',
  'substack.com',
  'mailchimp.com',
  'sendgrid.net',
];

export function domainOfEmail(value: string | null | undefined): string | null {
  const at = (value ?? '').trim().toLowerCase().lastIndexOf('@');
  if (at < 0) return null;
  const domain = (value ?? '').trim().toLowerCase().slice(at + 1);
  return domain.length > 0 ? domain : null;
}

/** Bulk and platform mail can never be a business answering a pitch. */
export function isNeverAReply(input: {
  fromEmail: string | null | undefined;
  listUnsubscribe?: string | null;
}): boolean {
  const domain = domainOfEmail(input.fromEmail);
  if (domain && NEVER_A_REPLY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return true;
  }
  // A List-Unsubscribe header is a bulk-mail marker; a person replying does not send one.
  if (input.listUnsubscribe?.trim()) return true;
  const local = (input.fromEmail ?? '').split('@')[0]?.toLowerCase() ?? '';
  return /^(no-?reply|do-?not-?reply|bounce|mailer-daemon|postmaster|notifications?)$/.test(local);
}

type PitchRow = {
  id: string;
  to_email: string | null;
  gmail_thread_id: string | null;
  business_name: string | null;
  opportunity_id: string | null;
  opportunity_business_key: string | null;
};

async function sentPitches(): Promise<PitchRow[]> {
  const result = await db.execute(sql`
    SELECT e.id,
           c.email AS to_email,
           e.gmail_thread_id,
           coalesce(o.business_name, c.business_name) AS business_name,
           o.id AS opportunity_id,
           o.business_key AS opportunity_business_key
    FROM outreach_emails e
    JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
    LEFT JOIN partnership_opportunities o ON o.outreach_email_id = e.id
    WHERE e.sent_at IS NOT NULL
      AND e.status IN ('sent', 'replied')
    ORDER BY e.sent_at DESC
  `);
  return (Array.isArray(result)
    ? result
    : ((result as unknown as { rows: PitchRow[] }).rows ?? [])) as PitchRow[];
}

function attribution(pitch: PitchRow, method: ReplyMatchMethod, note: string): ReplyAttribution {
  return {
    outreachEmailId: pitch.id,
    partnershipOpportunityId: pitch.opportunity_id,
    businessKey:
      pitch.opportunity_business_key ??
      (pitch.business_name ? businessKeyFor(pitch.business_name) : null),
    method,
    confidenceNote: note,
  };
}

export function matchReplyToPitch(input: {
  fromEmail: string | null | undefined;
  fromName?: string | null;
  subject?: string | null;
  threadId?: string | null;
  listUnsubscribe?: string | null;
  pitches: PitchRow[];
}): ReplyAttribution | null {
  if (isNeverAReply(input)) return null;

  const from = (input.fromEmail ?? '').trim().toLowerCase();
  if (!from) return null;
  const fromDomain = domainOfEmail(from);

  // 1. Same thread. Nothing is more certain than this.
  if (input.threadId?.trim()) {
    const byThread = input.pitches.find((p) => p.gmail_thread_id === input.threadId);
    if (byThread) {
      return attribution(byThread, 'thread', 'Same email thread as the pitch Benson sent.');
    }
  }

  // 2. The exact address Benson wrote to.
  const byExact = input.pitches.find((p) => (p.to_email ?? '').trim().toLowerCase() === from);
  if (byExact) {
    return attribution(
      byExact,
      'sender_exact',
      'Sent from the exact address Benson pitched.',
    );
  }

  // 3. A colleague at the pitched domain — the common real case.
  if (fromDomain && !FREE_MAIL_DOMAINS.has(fromDomain)) {
    const byDomain = input.pitches.find(
      (p) => domainOfEmail(p.to_email) === fromDomain,
    );
    if (byDomain) {
      return attribution(
        byDomain,
        'sender_domain',
        `Sent from ${fromDomain}, the same domain Benson pitched, but by a different person than the one addressed.`,
      );
    }
  }

  // 4. Same business on a different domain. Weakest, so it needs corroboration:
  //    the subject must still carry the thread of the conversation. Without that,
  //    a name collision alone is not enough to bind a reply to an opportunity.
  const subject = (input.subject ?? '').toLowerCase();
  const looksLikeReply = /^(re|fw|fwd)\s*:/i.test((input.subject ?? '').trim());
  if (looksLikeReply) {
    for (const pitch of input.pitches) {
      if (!pitch.business_name) continue;
      const key = pitch.opportunity_business_key ?? businessKeyFor(pitch.business_name);
      const tokens = key.split('-').filter((t) => t.length > 3);
      if (tokens.length === 0) continue;
      if (tokens.every((token) => subject.includes(token))) {
        return attribution(
          pitch,
          'business_key',
          `The subject is a reply naming ${pitch.business_name}, but it arrived from a different domain than the one pitched. Worth confirming the sender really speaks for the business.`,
        );
      }
    }
  }

  return null;
}

/** Resolves attribution for one inbound message against everything Benson has sent. */
export async function attributeInboundMessage(input: {
  fromEmail: string | null | undefined;
  fromName?: string | null;
  subject?: string | null;
  threadId?: string | null;
  listUnsubscribe?: string | null;
}): Promise<ReplyAttribution | null> {
  const pitches = await sentPitches();
  if (pitches.length === 0) return null;
  return matchReplyToPitch({ ...input, pitches });
}
