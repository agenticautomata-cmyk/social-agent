import {
  loadActiveSuppressions,
  textMatchesSuppression,
  type SuppressionRecord,
} from '../creator-agent/entity-suppression.js';
import type { BensonInsight } from './types.js';
import type { LearningSignalSnapshot } from './types.js';

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

const GENERIC_SUPPRESSION_TOKENS = new Set([
  'thrift',
  'store',
  'shop',
  'sale',
  'opening',
  'grand',
  'location',
  'kansas',
  'city',
  'missouri',
  'event',
  'weekend',
]);

function distinctiveTokens(phrases: string[]): string[] {
  return phrases
    .map(normalizeForMatch)
    .flatMap((phrase) => phrase.split(' '))
    .filter((token) => token.length > 2 && !GENERIC_SUPPRESSION_TOKENS.has(token));
}

/** Fuzzy suppression match — canonical name, aliases, domains, token overlap. */
export function textContainsSuppressedEntity(
  text: string,
  suppressions: SuppressionRecord[],
): SuppressionRecord | null {
  if (!text?.trim()) return null;

  const direct = textMatchesSuppression(text, suppressions, 'suppress_everywhere');
  if (direct) return direct;

  const normalized = normalizeForMatch(text);
  if (!normalized) return null;

  for (const row of suppressions) {
    const tokens = distinctiveTokens([row.canonicalName, ...row.aliases]);
    if (tokens.length === 0) continue;

    const textTokens = normalized.split(' ').filter((token) => token.length > 2);
    if (textTokens.length === 0) continue;

    const overlap = tokens.filter((token) =>
      textTokens.some((part) => part.includes(token) || token.includes(part)),
    );
    if (overlap.length >= Math.min(2, tokens.length)) return row;
    if (tokens.length === 1 && overlap.length === 1) return row;
  }

  return null;
}

export function recordTextContainsSuppressedEntity(input: {
  title?: string | null;
  summary?: string | null;
  businessName?: string | null;
  phrase?: string | null;
  sourceUrl?: string | null;
  suppressions: SuppressionRecord[];
}): SuppressionRecord | null {
  for (const field of [input.title, input.summary, input.businessName, input.phrase]) {
    if (!field) continue;
    const hit = textContainsSuppressedEntity(field, input.suppressions);
    if (hit) return hit;
  }
  return null;
}

export function filterLearningSignals(
  signals: LearningSignalSnapshot,
  suppressions: SuppressionRecord[],
): LearningSignalSnapshot {
  const keepText = (text: string) => !textContainsSuppressedEntity(text, suppressions);

  return {
    ...signals,
    preferenceEvents: signals.preferenceEvents.filter(
      (entry) =>
        !recordTextContainsSuppressedEntity({
          phrase: entry.topic ?? entry.note ?? entry.category,
          suppressions,
        }),
    ),
    feedbackEvents: signals.feedbackEvents.filter(
      (entry) => keepText([entry.comment, entry.reasonCode, entry.route].filter(Boolean).join(' ')),
    ),
    chatFeedbackEvents: signals.chatFeedbackEvents.filter(
      (entry) =>
        keepText([entry.comment, entry.answerPreview, entry.reasonCode].filter(Boolean).join(' ')),
    ),
    plannerActions: signals.plannerActions.filter((entry) => keepText(entry.title)),
    skippedOpportunities: signals.skippedOpportunities.filter((entry) => keepText(entry.title)),
    passedOpportunities: signals.passedOpportunities.filter((entry) => keepText(entry.phrase)),
    topPerformingPosts: signals.topPerformingPosts.filter((entry) =>
      keepText([entry.title, entry.location].filter(Boolean).join(' ')),
    ),
    performanceSignals: signals.performanceSignals.filter((entry) => keepText(entry.title)),
    timelyOpportunities: signals.timelyOpportunities.filter((entry) => keepText(entry.title)),
  };
}

export function learningOutputIsClean(input: {
  summary: string;
  insights: BensonInsight[];
  suppressions: SuppressionRecord[];
}): boolean {
  if (textContainsSuppressedEntity(input.summary, input.suppressions)) return false;
  return input.insights.every(
    (item) =>
      !textContainsSuppressedEntity(item.insight, input.suppressions) &&
      !textContainsSuppressedEntity(item.action, input.suppressions),
  );
}

export function sanitizeLearningSnapshot<T extends { summary: string; insights: BensonInsight[] }>(
  snapshot: T,
  suppressions: SuppressionRecord[],
): T | null {
  if (
    !learningOutputIsClean({
      summary: snapshot.summary,
      insights: snapshot.insights,
      suppressions,
    })
  ) {
    return null;
  }

  const insights = snapshot.insights.filter(
    (item) =>
      !textContainsSuppressedEntity(item.insight, suppressions) &&
      !textContainsSuppressedEntity(item.action, suppressions),
  );
  if (insights.length === 0 && snapshot.summary !== 'No meaningful new creator lessons since the last update.') {
    return null;
  }

  return {
    ...snapshot,
    summary: snapshot.summary.trim(),
    insights,
  };
}

export async function loadSuppressionsForLearning(): Promise<SuppressionRecord[]> {
  return loadActiveSuppressions(true);
}
