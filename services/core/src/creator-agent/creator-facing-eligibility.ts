/**
 * Creator-facing promotion eligibility.
 *
 * Used before any producer elevates a content item to
 * creator_candidate / actionable / top_pick so structured employment
 * (and other hard category hides) cannot be score-promoted into
 * contradictory durable state.
 *
 * The Batch 2 reconciliation provenance tag is NOT an eligibility input —
 * structured employment metadata / URL / title signals are.
 */

import { evaluateCategoryRules } from './exclusion-rules.js';
import { isEmploymentOpportunity } from './employment-intent.js';
import type { CreatorRelevanceInput, CreatorValueStatus } from './types.js';

export const CREATOR_FACING_STATUSES = [
  'creator_candidate',
  'actionable',
  'top_pick',
] as const;

export type CreatorFacingStatus = (typeof CREATOR_FACING_STATUSES)[number];

export type CreatorFacingPromotionInput = {
  title?: string | null;
  category?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  whyItMatters?: string | null;
  metadata?: Record<string, unknown> | null;
  contentCategory?: string | null;
  businessName?: string | null;
  sourceType?: string | null;
  signalType?: string | null;
  /** Ignored for classification — present so callers can pass full rows safely. */
  creatorRelevanceExplanation?: unknown;
};

export type CreatorFacingPromotionResult = {
  allowed: boolean;
  reasons: string[];
};

function metaCategory(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  for (const key of ['opportunityCategory', 'category', 'contentCategory']) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

export function isCreatorFacingStatus(
  status: string | null | undefined,
): status is CreatorFacingStatus {
  return (
    status === 'creator_candidate' || status === 'actionable' || status === 'top_pick'
  );
}

/**
 * Returns whether a producer may promote this row into a creator-facing status.
 * Does not read or require reconciliation provenance tags.
 */
export function evaluateCreatorFacingPromotion(
  input: CreatorFacingPromotionInput,
): CreatorFacingPromotionResult {
  const reasons: string[] = [];
  const category = input.category ?? input.contentCategory ?? metaCategory(input.metadata);

  if (
    isEmploymentOpportunity({
      title: input.title,
      category,
      sourceUrl: input.sourceUrl,
      summary: input.summary,
      whyItMatters: input.whyItMatters,
      metadata: input.metadata,
    })
  ) {
    reasons.push('employment_jobs_careers');
  }

  const categoryRule = evaluateCategoryRules({
    title: (input.title ?? '').trim() || 'untitled',
    sourceUrl: input.sourceUrl,
    summary: input.summary,
    contentCategory: category,
    businessName: input.businessName,
    sourceType: input.sourceType,
    signalType: input.signalType,
    metadata: input.metadata,
  } as CreatorRelevanceInput);

  // Category-rule hides (estate/library/etc.) also block promotion. Employment is
  // already covered above via structured detector — don't double-count that rule.
  if (categoryRule?.hidden && categoryRule.ruleKey !== 'employment_jobs_careers') {
    reasons.push(categoryRule.reason);
  }

  return { allowed: reasons.length === 0, reasons };
}

export function canPromoteToCreatorFacing(input: CreatorFacingPromotionInput): boolean {
  return evaluateCreatorFacingPromotion(input).allowed;
}

/**
 * Clamp a proposed status: if promotion is not allowed, force hidden_raw_signal.
 * Non-creator-facing proposals (researching / hidden / rejected / archived) pass through.
 */
export function clampCreatorFacingStatus(
  proposed: CreatorValueStatus,
  input: CreatorFacingPromotionInput,
): { status: CreatorValueStatus; blocked: boolean; reasons: string[] } {
  if (!isCreatorFacingStatus(proposed)) {
    return { status: proposed, blocked: false, reasons: [] };
  }
  const gate = evaluateCreatorFacingPromotion(input);
  if (gate.allowed) {
    return { status: proposed, blocked: false, reasons: [] };
  }
  return {
    status: 'hidden_raw_signal',
    blocked: true,
    reasons: gate.reasons,
  };
}
