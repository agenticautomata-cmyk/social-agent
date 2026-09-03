/**
 * The partnership decisions that belong on Today.
 *
 * Today is a decision desk, not a feed. A partnership earns a slot only when there
 * is a specific thing Kellie or Elliott can decide right now — approve this pitch,
 * answer this business, find this one missing contact. Research in progress, weak
 * leads and quarantined rows do not appear, because seeing them does not let anyone
 * do anything.
 *
 * Five kinds qualify, and each one names the decision rather than the record:
 *   - a pitch written from verified facts, waiting only on approval
 *   - a business reply that needs an answer
 *   - a follow-up whose wait has elapsed
 *   - a qualified opportunity blocked on a contact a person could resolve
 *   - a won partnership with an obligation coming due
 *
 * Deliberately absent: anything quarantined, anything whose contact is guessed, and
 * any opportunity still being researched. Raphael Hotel is the live example — it
 * qualifies at 73 but has no verified contact, so it appears as a contact to resolve
 * and never as a pitch to approve.
 */
import { sql } from 'drizzle-orm';

import { db } from '../db.js';
import { ACTIONABLE_PITCH_READINESS_STATUSES } from '../partnership-contracts/send-readiness.js';

export type PartnershipDecisionKind =
  | 'approve_pitch'
  | 'answer_reply'
  | 'follow_up_due'
  | 'resolve_contact'
  | 'partnership_obligation';

export type PartnershipDecision = {
  id: string;
  kind: PartnershipDecisionKind;
  businessName: string;
  /** What the person is being asked to do, in their words not the schema's. */
  title: string;
  /** Why this is on Today at all. */
  why: string;
  /** Where the decision actually gets made. */
  href: string;
  /** Plain-language compensation, so the stakes are visible before opening it. */
  compensationLabel: string | null;
  /** How solid the recipient is, so approval is never a blind trust exercise. */
  contactLabel: string | null;
  dueDate: string | null;
  /** Ordering weight; a reply waiting on Kellie outranks a pitch waiting on Kellie. */
  weight: number;
};

const COMPENSATION_LABELS: Record<string, string> = {
  cash: 'Paid',
  cash_plus_hosted: 'Paid plus hosted',
  fully_hosted: 'Fully hosted',
  gift_card_or_credit: 'Gift card or credit',
  discount_only: 'Discount only',
  unknown_requires_research: 'Compensation not established',
};

const CONTACT_LABELS: Record<string, string> = {
  verified_named_decision_maker: 'Named decision maker, verified',
  verified_role_inbox: 'Verified role inbox',
  official_general_inbox: 'Official general inbox',
  official_contact_form: 'Official contact form',
  inferred_unverified: 'Unverified',
  unknown: 'No contact yet',
};

/**
 * Weights, not timestamps, decide the order. A business that is waiting on a human
 * reply outranks work Benson generated, because the cost of being slow is external.
 */
const WEIGHTS: Record<PartnershipDecisionKind, number> = {
  answer_reply: 100,
  partnership_obligation: 90,
  follow_up_due: 70,
  approve_pitch: 60,
  resolve_contact: 40,
};

async function query<T>(text: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(text);
  return (Array.isArray(result)
    ? result
    : ((result as unknown as { rows: T[] }).rows ?? [])) as T[];
}

function compensationLabel(state: string | null | undefined, isPartial?: boolean): string | null {
  if (!state) return null;
  const base = COMPENSATION_LABELS[state] ?? null;
  if (!base) return null;
  return isPartial ? `${base} (partial)` : base;
}

/** Pitches that are written, evidenced, and waiting only on Kellie. */
async function pitchesAwaitingApproval(): Promise<PartnershipDecision[]> {
  const statuses = ACTIONABLE_PITCH_READINESS_STATUSES.map((s) => `'${s}'`).join(', ');
  const rows = await query<{
    id: string;
    subject: string;
    business_name: string | null;
    contact_evidence_state: string | null;
    compensation_state: string | null;
    compensation_is_partial: boolean | null;
    qualification_score: string | null;
  }>(sql`
    SELECT e.id,
           e.subject,
           coalesce(o.business_name, c.business_name) AS business_name,
           c.contact_evidence_state,
           o.compensation_state,
           o.compensation_is_partial,
           o.qualification_score
    FROM outreach_emails e
    JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
    LEFT JOIN partnership_opportunities o ON o.outreach_email_id = e.id
    WHERE e.quarantine_state = 'active'
      AND e.status IN ('draft', 'needs_approval')
      AND e.pitch_readiness_status IN (${sql.raw(statuses)})
    ORDER BY o.qualification_score DESC NULLS LAST, e.created_at DESC
  `);

  return rows.map((row) => {
    const business = row.business_name ?? 'a business';
    return {
      id: row.id,
      kind: 'approve_pitch' as const,
      businessName: business,
      title: `Approve the pitch to ${business}`,
      why: row.qualification_score
        ? `Written from verified facts and scored ${Math.round(Number(row.qualification_score))} out of 100. Nothing is missing except your approval.`
        : 'Written from verified facts. Nothing is missing except your approval.',
      href: '/email/approvals',
      compensationLabel: compensationLabel(
        row.compensation_state,
        row.compensation_is_partial ?? false,
      ),
      contactLabel: CONTACT_LABELS[row.contact_evidence_state ?? ''] ?? null,
      dueDate: null,
      weight: WEIGHTS.approve_pitch,
    };
  });
}

/**
 * Replies that need an answer.
 *
 * Bound to a pitch Benson sent, because an unbound inbound message is not a business
 * waiting on Kellie — every inbound message in live data today is unbound newsletter
 * and receipt mail. Requiring the link keeps that noise off Today.
 */
async function repliesNeedingAnswer(): Promise<PartnershipDecision[]> {
  const rows = await query<{
    id: string;
    business_name: string | null;
    received_at: Date | null;
    compensation_state: string | null;
    contact_evidence_state: string | null;
  }>(sql`
    SELECT m.id,
           coalesce(o.business_name, c.business_name) AS business_name,
           m.received_at,
           o.compensation_state,
           c.contact_evidence_state
    FROM outreach_inbound_messages m
    JOIN outreach_emails e ON e.id = m.outreach_email_id
    JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
    LEFT JOIN partnership_opportunities o ON o.outreach_email_id = e.id
    WHERE m.outreach_email_id IS NOT NULL
      AND m.is_read = false
    ORDER BY m.received_at DESC
  `);

  return rows.map((row) => {
    const business = row.business_name ?? 'a business';
    return {
      id: row.id,
      kind: 'answer_reply' as const,
      businessName: business,
      title: `${business} replied and is waiting on you`,
      why: 'A business you pitched has answered. Replying quickly is the difference between a partnership and a dead thread.',
      href: '/pitches',
      compensationLabel: compensationLabel(row.compensation_state),
      contactLabel: CONTACT_LABELS[row.contact_evidence_state ?? ''] ?? null,
      dueDate: null,
      weight: WEIGHTS.answer_reply,
    };
  });
}

/** Sent pitches whose configured wait has elapsed with no reply. */
async function followUpsDue(now: Date): Promise<PartnershipDecision[]> {
  const rows = await query<{
    id: string;
    business_name: string | null;
    follow_up_due_at: Date | null;
    follow_up_count: number;
    compensation_state: string | null;
    contact_evidence_state: string | null;
  }>(sql`
    SELECT e.id,
           coalesce(o.business_name, c.business_name) AS business_name,
           e.follow_up_due_at,
           e.follow_up_count,
           o.compensation_state,
           c.contact_evidence_state
    FROM outreach_emails e
    JOIN sponsor_contacts c ON c.id = e.sponsor_contact_id
    LEFT JOIN partnership_opportunities o ON o.outreach_email_id = e.id
    WHERE e.quarantine_state = 'active'
      AND e.status = 'sent'
      AND e.follow_up_due_at IS NOT NULL
      AND e.follow_up_due_at <= ${now}
      AND NOT EXISTS (
        SELECT 1 FROM outreach_inbound_messages m WHERE m.outreach_email_id = e.id
      )
    ORDER BY e.follow_up_due_at ASC
  `);

  return rows.map((row) => {
    const business = row.business_name ?? 'a business';
    return {
      id: row.id,
      kind: 'follow_up_due' as const,
      businessName: business,
      title: `Follow up with ${business}`,
      why:
        row.follow_up_count > 0
          ? `No reply since the last follow-up. This would be follow-up ${row.follow_up_count + 1}.`
          : 'No reply since the pitch went out, and the wait you configured has passed.',
      href: '/email/approvals',
      compensationLabel: compensationLabel(row.compensation_state),
      contactLabel: CONTACT_LABELS[row.contact_evidence_state ?? ''] ?? null,
      dueDate: row.follow_up_due_at ? row.follow_up_due_at.toISOString().slice(0, 10) : null,
      weight: WEIGHTS.follow_up_due,
    };
  });
}

/**
 * Opportunities worth pitching that are stuck on a contact.
 *
 * This is the honest alternative to guessing an address. Benson says who it wants to
 * reach and why it cannot, and a person with a phone can unblock it in a minute.
 * Only genuinely qualified opportunities appear, so this never becomes a chore list.
 */
async function contactsToResolve(): Promise<PartnershipDecision[]> {
  const rows = await query<{
    id: string;
    business_name: string | null;
    property_name: string | null;
    why_now: string | null;
    compensation_state: string | null;
    qualification_score: string | null;
  }>(sql`
    SELECT o.id,
           o.business_name,
           o.property_name,
           o.why_now,
           o.compensation_state,
           o.qualification_score
    FROM partnership_opportunities o
    WHERE o.send_ready = false
      AND o.lifecycle_state = 'researching'
      AND o.qualification_score >= 60
      AND o.blocked_reasons::text ILIKE '%contact%'
    ORDER BY o.qualification_score DESC
    LIMIT 3
  `);

  return rows.map((row) => {
    const business = row.property_name ?? row.business_name ?? 'a business';
    return {
      id: row.id,
      kind: 'resolve_contact' as const,
      businessName: business,
      title: `Find who to contact at ${business}`,
      why: row.why_now
        ? `Worth pitching — ${row.why_now.replace(/\.$/, '')} — but no contact has been verified, so Benson will not send anything.`
        : 'Worth pitching, but no contact has been verified, so Benson will not send anything.',
      href: '/pitches',
      compensationLabel: compensationLabel(row.compensation_state),
      contactLabel: CONTACT_LABELS.unknown ?? null,
      dueDate: null,
      weight: WEIGHTS.resolve_contact,
    };
  });
}

/** Won partnerships with something still owed. */
async function partnershipObligations(now: Date): Promise<PartnershipDecision[]> {
  const rows = await query<{
    id: string;
    business_name: string | null;
    compensation_state: string | null;
    next_obligation: string | null;
    next_obligation_due: Date | null;
  }>(sql`
    SELECT o.id,
           o.business_name,
           o.compensation_state,
           o.pitch_concept->>'nextObligation' AS next_obligation,
           (o.pitch_concept->>'nextObligationDue')::timestamptz AS next_obligation_due
    FROM partnership_opportunities o
    WHERE o.lifecycle_state = 'won'
      AND o.pitch_concept->>'nextObligation' IS NOT NULL
      AND (
        (o.pitch_concept->>'nextObligationDue')::timestamptz IS NULL
        OR (o.pitch_concept->>'nextObligationDue')::timestamptz <= ${new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)}
      )
    ORDER BY (o.pitch_concept->>'nextObligationDue')::timestamptz ASC NULLS LAST
    LIMIT 3
  `);

  return rows.map((row) => ({
    id: row.id,
    kind: 'partnership_obligation' as const,
    businessName: row.business_name ?? 'a partner',
    title: `${row.business_name ?? 'A partner'} is expecting ${row.next_obligation}`,
    why: row.next_obligation_due
      ? 'You agreed to this and the date is close. Missing it costs the relationship.'
      : 'You agreed to this and it has not been delivered yet.',
    href: '/pitches',
    compensationLabel: compensationLabel(row.compensation_state),
    contactLabel: null,
    dueDate: row.next_obligation_due
      ? row.next_obligation_due.toISOString().slice(0, 10)
      : null,
    weight: WEIGHTS.partnership_obligation,
  }));
}

/**
 * The cap exists so Today stays a desk. It is a ceiling and never a target — if only
 * one partnership needs a decision, Today shows one.
 */
export const MAX_PARTNERSHIP_DECISIONS = 5;

export async function loadPartnershipDecisions(
  now = new Date(),
): Promise<PartnershipDecision[]> {
  const groups = await Promise.all([
    repliesNeedingAnswer().catch(() => []),
    partnershipObligations(now).catch(() => []),
    followUpsDue(now).catch(() => []),
    pitchesAwaitingApproval().catch(() => []),
    contactsToResolve().catch(() => []),
  ]);

  const all = groups.flat();

  // One decision per business. Two pitches to the same hotel is one conversation.
  const seen = new Set<string>();
  const deduped: PartnershipDecision[] = [];
  for (const decision of all.sort((a, b) => b.weight - a.weight)) {
    const key = decision.businessName.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(decision);
  }

  return deduped.slice(0, MAX_PARTNERSHIP_DECISIONS);
}
