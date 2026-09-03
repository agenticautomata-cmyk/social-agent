/**
 * Backlog quarantine.
 *
 * Kellie's approval queue holds 75 pitches with a median age of 29 days and a maximum
 * of 58. Six are smoke-test fixtures on domains that cannot exist, 24 have no recipient
 * at all, and one is addressed to a business literally named "Who has the best
 * pistachio latte in KC?" — a discussion-thread headline that was promoted into the
 * contacts table.
 *
 * Nothing is deleted. Every row keeps its history and stays viewable deliberately.
 * `quarantine_state` decides only whether a row may appear in Kellie's primary
 * workflow: Today, Home, the Pitches default view, Telegram and email approvals.
 *
 * Pure module — the classifier takes a row shape and returns a decision, so the same
 * rules apply in the one-time classification script, at draft time, and in tests.
 */

import { looksLikeSyntheticFixture } from '../sponsor-outreach/recipient-safety.js';

export const QUARANTINE_STATES = [
  /** Eligible for Kellie's primary workflow. */
  'active',
  /** Smoke-test / QA data. Never real. */
  'quarantined_synthetic',
  /** Real-ish but too weak to spend Kellie's attention on. */
  'quarantined_weak',
  /** Was plausible once; the moment it referenced has passed. */
  'quarantined_stale',
  /** Addressed to something that is not a business (headline, question, listicle, rate plan). */
  'quarantined_invalid_entity',
  /** Kellie or Elliott explicitly set this aside. */
  'quarantined_by_operator',
] as const;

export type QuarantineState = (typeof QUARANTINE_STATES)[number];

export function isQuarantineState(value: unknown): value is QuarantineState {
  return typeof value === 'string' && (QUARANTINE_STATES as readonly string[]).includes(value);
}

export function isQuarantined(value: unknown): boolean {
  return isQuarantineState(value) ? value !== 'active' : false;
}

const STATE_LABELS: Record<QuarantineState, string> = {
  active: 'In your workflow',
  quarantined_synthetic: 'Test data',
  quarantined_weak: 'Too thin to act on',
  quarantined_stale: 'Out of date',
  quarantined_invalid_entity: 'Not a real business',
  quarantined_by_operator: 'Set aside by you',
};

export function quarantineStateLabel(state: QuarantineState): string {
  return STATE_LABELS[state];
}

/**
 * A business name that is actually an article headline, a discussion-thread question, a
 * listicle, or a hotel rate-plan name. These are the entity-extraction failures visible
 * in the live ranked feed: "Who has the best pistachio latte in KC?", "17 Kansas City
 * Farmers Markets Worth Exploring", "Advance Purchase Offer", "The SuperNatural 2.0",
 * "Dish & Drink KC: First impressions of Martini Corner's new Social House".
 */
export function looksLikeInvalidBusinessEntity(name: string | null | undefined): {
  invalid: boolean;
  reason: string | null;
} {
  const raw = (name ?? '').trim();
  if (!raw) return { invalid: true, reason: 'The record has no business name.' };

  if (raw.endsWith('?')) {
    return {
      invalid: true,
      reason: 'The business name is a question, which means a thread headline was promoted into the contacts table.',
    };
  }
  if (/^\d+\s+\S/.test(raw) && /\b(worth|best|things|places|spots|reasons|ways|must)\b/i.test(raw)) {
    return {
      invalid: true,
      reason: 'The business name is a listicle headline, not a business.',
    };
  }
  if (/:\s/.test(raw) && raw.length > 45) {
    return {
      invalid: true,
      reason:
        'The business name is a headline with a colon and a subtitle — the actual business is buried inside it.',
    };
  }
  if (
    /\b(advance purchase|stay longer|bed (and|&) breakfast|park (and|&) stay|suite deal|rate plan|advance rate|best available rate)\b/i.test(
      raw,
    )
  ) {
    return {
      invalid: true,
      reason: 'The business name is a hotel rate-plan or package name, not the hotel itself.',
    };
  }
  if (/^(the\s+)?[A-Za-z]+\s+\d+(\.\d+)?$/.test(raw) && /\d/.test(raw)) {
    return {
      invalid: true,
      reason: 'The business name looks like a versioned package name rather than a business.',
    };
  }
  if (/^https?:\/\//i.test(raw)) {
    return { invalid: true, reason: 'A raw URL was stored as the business name.' };
  }
  if (raw.split(/\s+/).length > 12) {
    return {
      invalid: true,
      reason: 'The business name is a full sentence, which means a headline was promoted into the contacts table.',
    };
  }
  return { invalid: false, reason: null };
}

export type QuarantineDecision = {
  state: QuarantineState;
  /** Plain-English reason. Stored on the row and shown when viewing quarantined items. */
  reason: string | null;
};

/** Drafts older than this reference "this week" about a week that is long gone. */
export const STALE_PITCH_DAYS = 21;

/**
 * Classifies one outreach_emails row. Deliberately ordered: synthetic beats invalid
 * entity beats stale beats weak, so the reason shown is the most fundamental one.
 */
export function classifyOutreachEmail(row: {
  status: string;
  createdAt: string | Date;
  updatedAt?: string | Date | null;
  businessName: string | null;
  contactEmail: string | null;
  contactNotes: string | null;
  contactVerificationStatus: string | null;
  pitchReadinessStatus: string | null;
  now?: Date;
}): QuarantineDecision {
  const now = row.now ?? new Date();

  // Terminal rows are history, not workflow. They stay active so the record reads
  // truthfully, but they are not in the approval queue anyway.
  if (['sent', 'simulated_sent', 'failed', 'canceled'].includes(row.status)) {
    return { state: 'active', reason: null };
  }

  if (
    looksLikeSyntheticFixture({
      email: row.contactEmail,
      businessName: row.businessName,
      notes: row.contactNotes,
    })
  ) {
    return {
      state: 'quarantined_synthetic',
      reason:
        'This is smoke-test data, not a real business. It was created by a QA batch and can never be sent.',
    };
  }

  const entity = looksLikeInvalidBusinessEntity(row.businessName);
  if (entity.invalid) {
    return { state: 'quarantined_invalid_entity', reason: entity.reason };
  }

  const created = new Date(row.createdAt).getTime();
  const ageDays = Number.isNaN(created) ? 0 : (now.getTime() - created) / 86_400_000;
  if (ageDays > STALE_PITCH_DAYS) {
    return {
      state: 'quarantined_stale',
      reason: `This draft is ${Math.round(ageDays)} days old. Anything it described as happening "this week" has already passed, so it needs rewriting rather than approving.`,
    };
  }

  const verification = (row.contactVerificationStatus ?? '').toLowerCase();
  const hasEmail = Boolean(row.contactEmail?.trim());
  if (!hasEmail && verification !== 'contact_form' && verification !== 'official_contact_form') {
    return {
      state: 'quarantined_weak',
      reason:
        'There is no email address and no official form for this business, so the pitch has nowhere to go until a contact is found.',
    };
  }
  if (verification === 'found_unverified' || verification === 'likely_contact_unverified') {
    return {
      state: 'quarantined_weak',
      reason:
        'The contact on file was never confirmed by an official source, so this pitch is not safe to approve.',
    };
  }
  if (row.pitchReadinessStatus === 'needs_angle' || row.pitchReadinessStatus === 'lead_only') {
    return {
      state: 'quarantined_weak',
      reason:
        'Benson never found a specific reason to contact this business, so the draft is a generic template rather than a real pitch.',
    };
  }

  return { state: 'active', reason: null };
}

/** Classifies one sponsor_contacts row. */
export function classifySponsorContact(row: {
  businessName: string | null;
  email: string | null;
  notes: string | null;
  contactVerificationStatus: string | null;
  entityType?: string | null;
}): QuarantineDecision {
  if (
    looksLikeSyntheticFixture({
      email: row.email,
      businessName: row.businessName,
      notes: row.notes,
    })
  ) {
    return {
      state: 'quarantined_synthetic',
      reason: 'Created by a QA smoke-test batch. Not a real business.',
    };
  }
  const entity = looksLikeInvalidBusinessEntity(row.businessName);
  if (entity.invalid) {
    return { state: 'quarantined_invalid_entity', reason: entity.reason };
  }
  return { state: 'active', reason: null };
}

/**
 * Classifies one creator_partnerships row. 101 of 114 are still `discovered` and only
 * 5 have a fit score, so most of this table is an un-researched stub rather than a
 * partnership.
 */
export function classifyCreatorPartnership(row: {
  brandName: string | null;
  pipelineStatus: string | null;
  fitScore: number | null;
  researchStatus: string | null;
  updatedAt: string | Date;
  now?: Date;
}): QuarantineDecision {
  const now = row.now ?? new Date();

  if (
    looksLikeSyntheticFixture({ businessName: row.brandName, email: null, notes: null })
  ) {
    return {
      state: 'quarantined_synthetic',
      reason: 'Created by a QA smoke-test batch. Not a real brand.',
    };
  }
  const entity = looksLikeInvalidBusinessEntity(row.brandName);
  if (entity.invalid) {
    return { state: 'quarantined_invalid_entity', reason: entity.reason };
  }
  if (row.pipelineStatus === 'discovered' && row.fitScore === null) {
    const updated = new Date(row.updatedAt).getTime();
    const ageDays = Number.isNaN(updated) ? 0 : (now.getTime() - updated) / 86_400_000;
    if (ageDays > 14) {
      return {
        state: 'quarantined_weak',
        reason:
          'This was submitted but never scored, and nothing has happened to it in over two weeks. It is a stub, not an opportunity.',
      };
    }
  }
  return { state: 'active', reason: null };
}
