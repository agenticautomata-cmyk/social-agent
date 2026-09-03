/**
 * Compensation model.
 *
 * The sponsor-outreach track had no compensation model at all — the pitch writer asked
 * for "a gift card or exclusive discount" because that phrase was in a template, not
 * because anything had been evaluated. `sponsor_opportunities.estimated_value` and
 * `actual_value` are NULL on all five live rows.
 *
 * Two rules drive the whole design:
 *   1. A discount is never described as a gifted experience.
 *   2. What the business has OFFERED is always separate from what Benson RECOMMENDS
 *      REQUESTING. Conflating them is how a creator ends up believing a 15% rate cut
 *      was a hosted stay.
 *
 * Pure module — no database, no network.
 */

export const COMPENSATION_STATES = [
  'cash',
  'cash_plus_hosted',
  'fully_hosted',
  'gift_card_or_credit',
  'discount_only',
  'unknown_requires_research',
] as const;

export type CompensationState = (typeof COMPENSATION_STATES)[number];

/**
 * The distinct things a hospitality business can actually give a creator. Kept
 * separate rather than collapsed, because "a $50 dining credit" and "a comped dinner"
 * are different promises and Kellie needs to see which one she is being offered.
 */
export const COMPENSATION_COMPONENT_KINDS = [
  'creator_fee',
  'usage_rights_payment',
  'complimentary_room',
  'hosted_meal',
  'folio_credit',
  'dining_credit',
  'gift_card',
  'media_rate',
  'partial_discount',
  'reimbursement',
  'travel_coverage',
] as const;

export type CompensationComponentKind = (typeof COMPENSATION_COMPONENT_KINDS)[number];

export type CompensationComponent = {
  kind: CompensationComponentKind;
  /** Dollar value when known. Null means "offered but unpriced" — never guessed. */
  amountUsd: number | null;
  /** Percentage off, for media_rate / partial_discount. */
  percentOff?: number | null;
  /** Plain-language description of exactly what was offered or is being requested. */
  detail: string;
  /** Where this came from. Required for anything on the OFFERED side. */
  evidenceUrl?: string | null;
  observedAt?: string | null;
};

const CASH_KINDS = new Set<CompensationComponentKind>(['creator_fee', 'usage_rights_payment']);
const HOSTED_KINDS = new Set<CompensationComponentKind>(['complimentary_room', 'hosted_meal']);
const CREDIT_KINDS = new Set<CompensationComponentKind>([
  'folio_credit',
  'dining_credit',
  'gift_card',
]);
const DISCOUNT_KINDS = new Set<CompensationComponentKind>(['media_rate', 'partial_discount']);

const COMPONENT_LABELS: Record<CompensationComponentKind, string> = {
  creator_fee: 'creator fee',
  usage_rights_payment: 'payment for usage rights',
  complimentary_room: 'complimentary room',
  hosted_meal: 'hosted meal',
  folio_credit: 'folio credit',
  dining_credit: 'dining credit',
  gift_card: 'gift card',
  media_rate: 'discounted media rate',
  partial_discount: 'partial discount',
  reimbursement: 'expense reimbursement',
  travel_coverage: 'travel coverage',
};

const STATE_LABELS: Record<CompensationState, string> = {
  cash: 'Paid',
  cash_plus_hosted: 'Paid plus hosted',
  fully_hosted: 'Fully hosted',
  gift_card_or_credit: 'Gift card or credit',
  discount_only: 'Discount only — not a hosted experience',
  unknown_requires_research: 'Not established yet',
};

/**
 * Default priority order from the spec. `gift_card_or_credit` only outranks
 * `discount_only` when the credit is adequate — see `compensationPriority`.
 */
const STATE_PRIORITY: Record<CompensationState, number> = {
  cash_plus_hosted: 60,
  cash: 50,
  fully_hosted: 40,
  gift_card_or_credit: 30,
  discount_only: 10,
  unknown_requires_research: 5,
};

export function isCompensationState(value: unknown): value is CompensationState {
  return typeof value === 'string' && (COMPENSATION_STATES as readonly string[]).includes(value);
}

export function normalizeCompensationState(value: unknown): CompensationState {
  return isCompensationState(value) ? value : 'unknown_requires_research';
}

export function compensationStateLabel(state: CompensationState): string {
  return STATE_LABELS[state];
}

export function compensationComponentLabel(kind: CompensationComponentKind): string {
  return COMPONENT_LABELS[kind];
}

/**
 * A credit or gift card counts as real compensation only if it plausibly covers the
 * experience being proposed. A $20 daily breakfast credit against a proposed overnight
 * stay is PARTIAL compensation, and saying otherwise would mislead Kellie.
 */
export function isCreditAdequate(input: {
  creditUsd: number | null;
  estimatedExperienceCostUsd: number | null;
}): { adequate: boolean; reason: string } {
  if (input.creditUsd === null) {
    return {
      adequate: false,
      reason: 'The credit has no stated value, so it cannot be assumed to cover the experience.',
    };
  }
  if (input.estimatedExperienceCostUsd === null) {
    return {
      adequate: false,
      reason:
        'The cost of the proposed experience is not established, so the credit cannot be judged adequate.',
    };
  }
  if (input.creditUsd >= input.estimatedExperienceCostUsd) {
    return {
      adequate: true,
      reason: `The $${input.creditUsd} credit covers the estimated $${input.estimatedExperienceCostUsd} experience.`,
    };
  }
  return {
    adequate: false,
    reason: `The $${input.creditUsd} credit does not cover the estimated $${input.estimatedExperienceCostUsd} experience, so this is partial compensation.`,
  };
}

export type CompensationAssessment = {
  state: CompensationState;
  label: string;
  /** True when the offer does not cover the proposed experience. */
  isPartial: boolean;
  /** Plain-language sentence describing what the BUSINESS has offered. */
  offeredSummary: string;
  /** Plain-language sentence describing what BENSON RECOMMENDS REQUESTING. */
  requestedSummary: string;
  /** One line combining both without conflating them. Safe for a card or a digest. */
  displaySummary: string;
  notes: string[];
};

function describeComponents(components: CompensationComponent[]): string {
  if (components.length === 0) return '';
  return components
    .map((c) => {
      const label = COMPONENT_LABELS[c.kind];
      if (c.amountUsd !== null && c.amountUsd !== undefined) {
        return `${label} ($${c.amountUsd})`;
      }
      if (c.percentOff !== null && c.percentOff !== undefined) {
        return `${label} (${c.percentOff}% off)`;
      }
      return label;
    })
    .join(', ');
}

/**
 * Derives the single explicit compensation state from what has actually been offered.
 * An empty offer list is `unknown_requires_research` — never optimistically upgraded.
 */
export function deriveCompensationState(input: {
  offered: CompensationComponent[];
  estimatedExperienceCostUsd?: number | null;
}): { state: CompensationState; isPartial: boolean; notes: string[] } {
  const notes: string[] = [];
  const offered = input.offered ?? [];
  if (offered.length === 0) {
    return {
      state: 'unknown_requires_research',
      isPartial: false,
      notes: ['Nothing has been offered yet — the compensation still needs to be established.'],
    };
  }

  const hasCash = offered.some((c) => CASH_KINDS.has(c.kind));
  const hasHosted = offered.some((c) => HOSTED_KINDS.has(c.kind));
  const credits = offered.filter((c) => CREDIT_KINDS.has(c.kind));
  const hasDiscountOnly = offered.every((c) => DISCOUNT_KINDS.has(c.kind));

  if (hasCash && hasHosted) {
    return { state: 'cash_plus_hosted', isPartial: false, notes };
  }
  if (hasCash) {
    if (offered.some((c) => DISCOUNT_KINDS.has(c.kind))) {
      notes.push(
        'The cash component is paired with a discount rather than a hosted stay, so part of the experience is still out of pocket.',
      );
      return { state: 'cash', isPartial: true, notes };
    }
    return { state: 'cash', isPartial: false, notes };
  }
  if (hasHosted) {
    const stillPaying = offered.some((c) => DISCOUNT_KINDS.has(c.kind));
    if (stillPaying) {
      notes.push(
        'Part of the stay is hosted and part is discounted, so this is not a fully hosted experience.',
      );
      return { state: 'fully_hosted', isPartial: true, notes };
    }
    return { state: 'fully_hosted', isPartial: false, notes };
  }
  if (credits.length > 0) {
    const creditTotal = credits.reduce((sum, c) => sum + (c.amountUsd ?? 0), 0);
    const anyPriced = credits.some((c) => c.amountUsd !== null && c.amountUsd !== undefined);
    const adequacy = isCreditAdequate({
      creditUsd: anyPriced ? creditTotal : null,
      estimatedExperienceCostUsd: input.estimatedExperienceCostUsd ?? null,
    });
    notes.push(adequacy.reason);
    return { state: 'gift_card_or_credit', isPartial: !adequacy.adequate, notes };
  }
  if (hasDiscountOnly) {
    notes.push(
      'This is a discount on a rate Kellie would still pay. It is not a gifted or hosted experience.',
    );
    return { state: 'discount_only', isPartial: true, notes };
  }

  notes.push('The offer does not map to a known compensation type and needs a human look.');
  return { state: 'unknown_requires_research', isPartial: true, notes };
}

/**
 * Builds the full display assessment. Deliberately produces two separate sentences so
 * no surface can accidentally present the ask as the offer.
 */
export function assessCompensation(input: {
  offered: CompensationComponent[];
  requested: CompensationComponent[];
  estimatedExperienceCostUsd?: number | null;
  businessName?: string | null;
}): CompensationAssessment {
  const derived = deriveCompensationState({
    offered: input.offered,
    estimatedExperienceCostUsd: input.estimatedExperienceCostUsd,
  });

  const business = input.businessName?.trim() || 'The business';
  const offeredText = describeComponents(input.offered ?? []);
  const requestedText = describeComponents(input.requested ?? []);

  const offeredSummary = offeredText
    ? `${business} has offered: ${offeredText}.`
    : `${business} has not offered anything yet.`;
  const requestedSummary = requestedText
    ? `Benson recommends requesting: ${requestedText}.`
    : 'Benson has no recommended ask yet — the concept and deliverables need to be settled first.';

  const displaySummary = `${STATE_LABELS[derived.state]}${
    derived.isPartial && derived.state !== 'unknown_requires_research' ? ' (partial)' : ''
  } · ${offeredSummary} ${requestedSummary}`;

  return {
    state: derived.state,
    label: STATE_LABELS[derived.state],
    isPartial: derived.isPartial,
    offeredSummary,
    requestedSummary,
    displaySummary,
    notes: derived.notes,
  };
}

/**
 * Ranking value for prioritising opportunities. An inadequate credit drops below a
 * discount-only offer, because a token gift card with heavy deliverables attached is
 * worse for Kellie than a plain rate cut she can decline.
 */
export function compensationPriority(state: CompensationState, isPartial: boolean): number {
  const base = STATE_PRIORITY[state];
  if (state === 'gift_card_or_credit' && isPartial) return STATE_PRIORITY.discount_only - 1;
  return base;
}

/**
 * Deliverable weight Benson may reasonably ask for at a given compensation level.
 * Prevents the "demand heavy deliverables for low comp" failure the spec calls out.
 */
export function maxReasonableDeliverables(
  state: CompensationState,
  isPartial: boolean,
): { count: number; guidance: string } {
  switch (state) {
    case 'cash_plus_hosted':
      return {
        count: 4,
        guidance:
          'Paid plus hosted supports a full package: multiple in-feed videos, stories, and usage rights.',
      };
    case 'cash':
      return {
        count: 3,
        guidance: 'A paid fee supports a defined multi-deliverable package.',
      };
    case 'fully_hosted':
      return isPartial
        ? { count: 2, guidance: 'Partly hosted — keep the deliverables modest.' }
        : {
            count: 3,
            guidance:
              'A fully hosted stay reasonably supports one in-feed video plus supporting stories.',
          };
    case 'gift_card_or_credit':
      return isPartial
        ? {
            count: 1,
            guidance:
              'The credit does not cover the experience, so ask for one deliverable at most and say so plainly.',
          }
        : { count: 2, guidance: 'An adequate credit supports one video plus stories.' };
    case 'discount_only':
      return {
        count: 1,
        guidance:
          'A discount is not compensation. Offer at most organic coverage, and do not commit to a deliverable schedule.',
      };
    default:
      return {
        count: 1,
        guidance:
          'Compensation is not established, so do not commit to deliverables — propose the concept and ask what they can support.',
      };
  }
}

/** Parses the jsonb column shape back into typed components, dropping unknown kinds. */
export function parseCompensationComponents(value: unknown): CompensationComponent[] {
  if (!Array.isArray(value)) return [];
  const out: CompensationComponent[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const kind = item.kind;
    if (
      typeof kind !== 'string' ||
      !(COMPENSATION_COMPONENT_KINDS as readonly string[]).includes(kind)
    ) {
      continue;
    }
    out.push({
      kind: kind as CompensationComponentKind,
      amountUsd: typeof item.amountUsd === 'number' ? item.amountUsd : null,
      percentOff: typeof item.percentOff === 'number' ? item.percentOff : null,
      detail: typeof item.detail === 'string' ? item.detail : COMPONENT_LABELS[kind as CompensationComponentKind],
      evidenceUrl: typeof item.evidenceUrl === 'string' ? item.evidenceUrl : null,
      observedAt: typeof item.observedAt === 'string' ? item.observedAt : null,
    });
  }
  return out;
}
