/**
 * Opportunity qualification.
 *
 * The live ranked feed returned nine opportunities all stamped `confidence: 100`. One
 * was a real hospitality lead. The others included an SEO page about California thrift
 * donation locations, a magazine column headline, and a hotel rate plan called
 * "Advance Purchase Offer". A single constant score told Kellie all nine were equally
 * certain, which is worse than no score at all.
 *
 * Scoring here is additive over named, defensible factors, and every factor records
 * why it contributed. Nothing scores on recency or keyword match. An opportunity that
 * cannot answer the nine qualification questions does not surface, however fresh it is.
 *
 * Pure module.
 */

import {
  compensationPriority,
  type CompensationState,
} from '../partnership-contracts/compensation.js';
import type { ContactEvidenceState } from '../partnership-contracts/contact-evidence.js';
import { contactEvidenceRank } from '../partnership-contracts/contact-evidence.js';

/** The nine questions a qualified opportunity must answer. */
export type QualificationAnswers = {
  /** What is the business? */
  business: string | null;
  /** Why does it fit Kellie specifically — not "a creator", her. */
  whyKellie: string | null;
  /** Why now? Must trace to a dated or currently-published fact. */
  whyNow: string | null;
  /** What could she actually create? */
  contentConcept: string | null;
  /** What does the business get out of it? */
  businessBenefit: string | null;
  /** What is she asking for? */
  theAsk: string | null;
  /** Who can approve it? */
  decisionMaker: string | null;
  /** What evidence supports all of the above? */
  evidence: string[];
  /** What is still unknown. An empty list here is usually a lie. */
  unknowns: string[];
};

export function isFullyQualified(answers: QualificationAnswers): boolean {
  return Boolean(
    answers.business &&
      answers.whyKellie &&
      answers.whyNow &&
      answers.contentConcept &&
      answers.businessBenefit &&
      answers.theAsk &&
      answers.decisionMaker &&
      answers.evidence.length > 0,
  );
}

/** Questions with no answer, phrased as the research still outstanding. */
export function missingQualificationAnswers(answers: QualificationAnswers): string[] {
  const missing: string[] = [];
  if (!answers.business) missing.push('which business this actually is');
  if (!answers.whyKellie) missing.push('why this fits Kellie specifically');
  if (!answers.whyNow) missing.push('why now rather than any other week');
  if (!answers.contentConcept) missing.push('what Kellie would actually make');
  if (!answers.businessBenefit) missing.push('what the business gets');
  if (!answers.theAsk) missing.push('what Kellie is asking for');
  if (!answers.decisionMaker) missing.push('who can approve it');
  if (answers.evidence.length === 0) missing.push('any evidence at all');
  return missing;
}

export type QualificationFactor = {
  key: string;
  /** Points contributed. Negative is allowed and meaningful. */
  points: number;
  max: number;
  /** Why this factor scored what it did, in plain language. */
  reason: string;
};

export type QualificationInput = {
  /** Audience and geography fit. */
  inKcMetro: boolean;
  geographyNote: string | null;
  /** Is this hospitality content Kellie actually makes? */
  hospitalityFit: 'hotel' | 'restaurant' | 'bar' | 'attraction' | 'other' | 'not_hospitality';
  /** A dated, currently-valid reason to make contact this week. */
  timelyHook: { description: string; date: string | null; isRecurring: boolean } | null;
  /** Published evidence this business works with local creators. */
  collaboratesWithCreators: { evidence: string; url: string } | null;
  contactEvidenceState: ContactEvidenceState;
  compensationState: CompensationState;
  compensationIsPartial: boolean;
  /** Prior relationship, if any. */
  priorRelationship: {
    hasHistory: boolean;
    outcome: 'won' | 'declined' | 'no_response' | 'in_progress' | null;
    /** NULL means Kellie has not said. Never assumed to be yes. */
    approachAgain: boolean | null;
  } | null;
  /** Whether Benson has a specific concept, not a template angle. */
  conceptIsSpecific: boolean;
  /** How many of the nine qualification questions are answered. */
  answers: QualificationAnswers;
  /** Days until the opportunity's deadline, when there is one. */
  daysUntilDeadline: number | null;
  /** Minimum notice this route requires, e.g. Visit KC's published 14 days. */
  requiredLeadTimeDays: number | null;
};

export type QualificationResult = {
  /** 0-100. Never a constant — derived entirely from the factors below. */
  score: number;
  factors: QualificationFactor[];
  /** True only when this is worth Kellie's attention right now. */
  surfaceToKellie: boolean;
  /** Why it is or is not being surfaced. */
  verdict: string;
  missing: string[];
  /** Hard disqualifiers, e.g. a route whose lead time cannot be met. */
  disqualifiers: string[];
};

/**
 * Only genuinely surface a small number. The governing principle is that five
 * excellent actionable opportunities beat eighty incomplete leads, so this bar is
 * deliberately high and the score alone does not clear it.
 */
export const SURFACE_SCORE_THRESHOLD = 55;

export function qualifyOpportunity(input: QualificationInput): QualificationResult {
  const factors: QualificationFactor[] = [];
  const disqualifiers: string[] = [];

  // --- Audience and geography fit (max 15)
  if (input.inKcMetro) {
    factors.push({
      key: 'geography',
      points: 15,
      max: 15,
      reason:
        input.geographyNote ??
        'The business is in the Kansas City metro, which is the whole of Kellie\u2019s audience.',
    });
  } else {
    factors.push({
      key: 'geography',
      points: 0,
      max: 15,
      reason:
        input.geographyNote ??
        'The business is outside the Kansas City metro, so Kellie\u2019s audience cannot visit it.',
    });
    disqualifiers.push(
      'This business is not in the Kansas City metro, so it is not a fit for a local creator.',
    );
  }

  // --- Hospitality content fit (max 15)
  const hospitalityPoints: Record<QualificationInput['hospitalityFit'], number> = {
    hotel: 15,
    restaurant: 13,
    bar: 11,
    attraction: 9,
    other: 3,
    not_hospitality: 0,
  };
  const fitPoints = hospitalityPoints[input.hospitalityFit];
  factors.push({
    key: 'hospitality_fit',
    points: fitPoints,
    max: 15,
    reason:
      input.hospitalityFit === 'not_hospitality'
        ? 'This is not a hospitality business, so it is outside what Benson is looking for here.'
        : `This is a ${input.hospitalityFit.replace('_', ' ')}, which is squarely the kind of place Kellie covers.`,
  });
  if (input.hospitalityFit === 'not_hospitality') {
    disqualifiers.push('This is not a hospitality business.');
  }

  // --- A real, current reason to reach out now (max 20)
  // This is the factor the old system faked. A recency timestamp is not a reason.
  if (input.timelyHook) {
    const dated = Boolean(input.timelyHook.date);
    factors.push({
      key: 'why_now',
      points: dated ? 20 : 12,
      max: 20,
      reason: dated
        ? `There is a specific dated reason to make contact now: ${input.timelyHook.description}.`
        : `There is a current but undated reason to make contact: ${input.timelyHook.description}.`,
    });
  } else {
    factors.push({
      key: 'why_now',
      points: 0,
      max: 20,
      reason:
        'Nothing is happening at this business that gives Kellie a reason to write this week rather than any other.',
    });
  }

  // --- Evidence they work with creators (max 10)
  factors.push(
    input.collaboratesWithCreators
      ? {
          key: 'creator_collaboration',
          points: 10,
          max: 10,
          reason: `They have worked with creators before: ${input.collaboratesWithCreators.evidence}.`,
        }
      : {
          key: 'creator_collaboration',
          points: 0,
          max: 10,
          reason: 'No published evidence that this business collaborates with local creators.',
        },
  );

  // --- Contact quality (max 15)
  const contactRank = contactEvidenceRank(input.contactEvidenceState);
  const contactPoints = Math.round((contactRank / 5) * 15);
  factors.push({
    key: 'contact_quality',
    points: contactPoints,
    max: 15,
    reason: contactPointsReason(input.contactEvidenceState),
  });

  // --- Compensation potential (max 15)
  const compPriority = compensationPriority(input.compensationState, input.compensationIsPartial);
  const compPoints = Math.max(0, Math.round((compPriority / 60) * 15));
  factors.push({
    key: 'compensation_potential',
    points: compPoints,
    max: 15,
    reason: compensationReason(input.compensationState, input.compensationIsPartial),
  });

  // --- Concept quality (max 10)
  factors.push(
    input.conceptIsSpecific
      ? {
          key: 'concept',
          points: 10,
          max: 10,
          reason: 'Benson has a specific concept for this business, not a reusable template angle.',
        }
      : {
          key: 'concept',
          points: 0,
          max: 10,
          reason:
            'Benson has no concept specific to this business yet, so any pitch would be a template.',
        },
  );

  // --- Prior relationship (max 10, and can disqualify)
  if (input.priorRelationship?.hasHistory) {
    if (input.priorRelationship.approachAgain === false) {
      factors.push({
        key: 'relationship',
        points: -30,
        max: 10,
        reason: 'Kellie has said she does not want to approach this business again.',
      });
      disqualifiers.push('Kellie has asked not to approach this business again.');
    } else if (input.priorRelationship.outcome === 'won') {
      factors.push({
        key: 'relationship',
        points: 10,
        max: 10,
        reason: 'Kellie has worked with this business before and it went well.',
      });
    } else if (input.priorRelationship.outcome === 'in_progress') {
      factors.push({
        key: 'relationship',
        points: -20,
        max: 10,
        reason: 'There is already an open conversation with this business — do not start a second.',
      });
      disqualifiers.push('There is already an open conversation with this business.');
    } else if (input.priorRelationship.outcome === 'declined') {
      factors.push({
        key: 'relationship',
        points: -10,
        max: 10,
        reason: 'This business declined previously, so a new approach needs a genuinely new reason.',
      });
    } else {
      factors.push({
        key: 'relationship',
        points: 0,
        max: 10,
        reason: 'Kellie has contacted this business before and never heard back.',
      });
    }
  } else {
    factors.push({
      key: 'relationship',
      points: 3,
      max: 10,
      reason: 'No prior contact with this business, so nothing to work around.',
    });
  }

  // --- Timing feasibility. A route whose published notice period cannot be met is not
  // an opportunity, it is a missed one, and saying otherwise wastes Kellie's time.
  if (
    input.requiredLeadTimeDays !== null &&
    input.daysUntilDeadline !== null &&
    input.daysUntilDeadline < input.requiredLeadTimeDays
  ) {
    disqualifiers.push(
      `This route needs ${input.requiredLeadTimeDays} days notice and the date is only ${input.daysUntilDeadline} days away, so it cannot be met this time.`,
    );
    factors.push({
      key: 'timing_feasible',
      points: -25,
      max: 0,
      reason: `The published minimum notice for this route is ${input.requiredLeadTimeDays} days and there are only ${input.daysUntilDeadline}.`,
    });
  }

  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const missing = missingQualificationAnswers(input.answers);
  const fullyQualified = isFullyQualified(input.answers);

  const surfaceToKellie =
    disqualifiers.length === 0 && score >= SURFACE_SCORE_THRESHOLD && fullyQualified;

  return {
    score,
    factors,
    surfaceToKellie,
    verdict: buildVerdict({ surfaceToKellie, score, disqualifiers, missing }),
    missing,
    disqualifiers,
  };
}

function contactPointsReason(state: ContactEvidenceState): string {
  switch (state) {
    case 'verified_named_decision_maker':
      return 'There is a named, verified person who can actually say yes.';
    case 'verified_role_inbox':
      return 'There is a verified media or partnerships inbox published by the business itself.';
    case 'official_general_inbox':
      return 'Only a general inbox is published, so the pitch will need forwarding internally.';
    case 'official_contact_form':
      return 'The only published route is an official form, which Kellie submits herself.';
    case 'inferred_unverified':
      return 'The contact on file is not confirmed by any official source, so it cannot be used.';
    default:
      return 'No contact has been found for this business yet.';
  }
}

function compensationReason(state: CompensationState, isPartial: boolean): string {
  switch (state) {
    case 'cash_plus_hosted':
      return 'A paid fee alongside a hosted stay is the strongest outcome available.';
    case 'cash':
      return 'This route can pay a creator fee.';
    case 'fully_hosted':
      return isPartial
        ? 'Part of the experience would be hosted and part would not.'
        : 'The experience would be fully hosted.';
    case 'gift_card_or_credit':
      return isPartial
        ? 'The credit on offer does not cover the proposed experience, so this is partial compensation.'
        : 'The credit on offer would cover the proposed experience.';
    case 'discount_only':
      return 'Only a discount is on offer, which means Kellie would still be paying to be there.';
    default:
      return 'What this business can offer has not been established yet.';
  }
}

function buildVerdict(input: {
  surfaceToKellie: boolean;
  score: number;
  disqualifiers: string[];
  missing: string[];
}): string {
  if (input.disqualifiers.length > 0) return input.disqualifiers[0]!;
  if (input.missing.length > 0) {
    return `Not ready to show Kellie — Benson still needs ${formatList(input.missing)}.`;
  }
  if (input.score < SURFACE_SCORE_THRESHOLD) {
    return `Scored ${input.score}, below the bar for taking up Kellie\u2019s attention.`;
  }
  return `Scored ${input.score} and answers every qualification question.`;
}

function formatList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Ranks qualified opportunities. Ties break on compensation then contact quality, so
 * two equally-evidenced opportunities order by which one is actually worth more to
 * Kellie rather than by which was scraped most recently.
 */
export function rankOpportunities<T extends { qualification: QualificationResult }>(
  opportunities: T[],
): T[] {
  return [...opportunities].sort((a, b) => {
    if (b.qualification.score !== a.qualification.score) {
      return b.qualification.score - a.qualification.score;
    }
    const factor = (o: T, key: string): number =>
      o.qualification.factors.find((f) => f.key === key)?.points ?? 0;
    const comp = factor(b, 'compensation_potential') - factor(a, 'compensation_potential');
    if (comp !== 0) return comp;
    return factor(b, 'contact_quality') - factor(a, 'contact_quality');
  });
}
