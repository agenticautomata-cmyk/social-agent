import type { CreatorRelevanceInput, CreatorRelevanceResult, CreatorValueStatus } from './types.js';
import { evaluateCategoryRules } from './exclusion-rules.js';
import { loadActiveSuppressions, recordMatchesSuppression } from './entity-suppression.js';
import { computeLifecycleStatus, isLifecycleVisible } from './lifecycle.js';

function hasUsableLink(input: CreatorRelevanceInput): boolean {
  return Boolean(input.sourceUrl && input.sourceUrl.startsWith('http'));
}

function hasIdentifiableSubject(input: CreatorRelevanceInput): boolean {
  const title = input.title.trim();
  return title.length >= 8 && !/^(tbd|unknown|event|sale)$/i.test(title);
}

export async function evaluateCreatorRelevance(
  input: CreatorRelevanceInput,
  options?: { skipSuppressionLoad?: boolean; suppressions?: Awaited<ReturnType<typeof loadActiveSuppressions>> },
): Promise<CreatorRelevanceResult> {
  const explanations: string[] = [];
  const lifecycleStatus = computeLifecycleStatus(input);

  if (!isLifecycleVisible(lifecycleStatus)) {
    return {
      creatorValueStatus: 'archived',
      lifecycleStatus,
      explanations: [`lifecycle:${lifecycleStatus}`],
      blockedBySuppression: false,
      blockedByCategoryRule: false,
    };
  }

  const suppressions =
    options?.suppressions ??
    (options?.skipSuppressionLoad ? [] : await loadActiveSuppressions());

  const suppression = recordMatchesSuppression({
    title: input.title,
    businessName: input.businessName,
    sourceUrl: input.sourceUrl,
    suppressions,
    scope: 'suppress_everywhere',
  });
  if (suppression) {
    return {
      creatorValueStatus: 'rejected',
      lifecycleStatus,
      explanations: [`suppressed:${suppression.canonicalName}`],
      blockedBySuppression: true,
      blockedByCategoryRule: false,
    };
  }

  const categoryRule = evaluateCategoryRules(input);
  if (categoryRule?.hidden) {
    return {
      creatorValueStatus: 'hidden_raw_signal',
      lifecycleStatus,
      explanations: [categoryRule.reason],
      blockedBySuppression: false,
      blockedByCategoryRule: true,
    };
  }
  if (categoryRule) explanations.push(categoryRule.reason);

  let status: CreatorValueStatus = 'researching';

  const relevance = Number((input.metadata as Record<string, unknown> | undefined)?.bensonScoreComposite ?? 0);
  const hasScore = relevance > 0;

  if (hasScore && relevance >= 0.72 && hasUsableLink(input) && hasIdentifiableSubject(input)) {
    status = 'actionable';
    explanations.push('score:actionable_threshold');
  } else if (hasScore && relevance >= 0.55 && hasUsableLink(input)) {
    status = 'creator_candidate';
    explanations.push('score:creator_candidate_threshold');
  } else if (categoryRule && !categoryRule.hidden) {
    status = 'researching';
  } else {
    status = 'hidden_raw_signal';
    explanations.push('default:hidden_until_enriched');
  }

  return {
    creatorValueStatus: status,
    lifecycleStatus,
    explanations,
    blockedBySuppression: false,
    blockedByCategoryRule: false,
  };
}

export function qualifiesForTopPick(input: {
  title: string;
  sourceUrl?: string | null;
  reviewUrl?: string | null;
  creatorValueStatus: CreatorValueStatus;
  lifecycleStatus: string;
  classificationVerified?: boolean;
  whyFit?: string | null;
  nextAction?: string | null;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.creatorValueStatus !== 'actionable' && input.creatorValueStatus !== 'top_pick') {
    reasons.push('creator_status_not_actionable');
  }
  if (!['upcoming', 'active', 'expiring_soon'].includes(input.lifecycleStatus)) {
    reasons.push('lifecycle_not_current');
  }
  if (!input.sourceUrl) reasons.push('missing_source_url');
  if (!input.reviewUrl) reasons.push('missing_internal_link');
  if (!input.whyFit) reasons.push('missing_why_fit');
  if (!input.nextAction) reasons.push('missing_next_action');
  if (input.classificationVerified === false) reasons.push('classification_not_verified');
  return { ok: reasons.length === 0, reasons };
}

export async function evaluateAndPersistContentItem(
  input: CreatorRelevanceInput & { contentItemId: string },
): Promise<CreatorRelevanceResult> {
  const result = await evaluateCreatorRelevance(input);
  const { db } = await import('../db.js');
  const { contentItems } = await import('../schema.js');
  const { eq } = await import('drizzle-orm');

  await db
    .update(contentItems)
    .set({
      creatorValueStatus: result.creatorValueStatus,
      lifecycleStatus: result.lifecycleStatus,
      creatorRelevanceExplanation: result.explanations,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, input.contentItemId));

  return result;
}
