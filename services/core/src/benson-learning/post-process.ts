import type { BensonInsight, TimelyOpportunitySignal } from './types.js';
import { textReferencesExpiredDate } from './freshness.js';
import { textContainsSuppressedEntity } from './suppression.js';
import type { SuppressionRecord } from '../creator-agent/entity-suppression.js';
import {
  filterNovelLessons,
  rejectPermanentProhibitionFromWeakEvidence,
} from './novelty.js';
import { applyMonetizationFirstCorrections } from './monetization-first.js';

const SPECIFIC_EVENT_RE =
  /\b(grand opening|opening on|on july|on august|on september|belton|overland park|legends outlet)\b/i;

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function lessonMatchesTimelyOpportunity(
  lesson: BensonInsight,
  opportunities: TimelyOpportunitySignal[],
): boolean {
  const haystack = normalizeTitle(`${lesson.insight} ${lesson.action}`);
  for (const opp of opportunities) {
    const title = normalizeTitle(opp.title);
    const tokens = title.split(' ').filter((token) => token.length > 3);
    const overlap = tokens.filter((token) => haystack.includes(token)).length;
    if (overlap >= Math.min(2, tokens.length)) return true;
  }
  return false;
}

export function applyLessonQualityGates(input: {
  summary: string;
  insights: BensonInsight[];
  previousInsights: BensonInsight[];
  timelyOpportunities: TimelyOpportunitySignal[];
  suppressions: SuppressionRecord[];
  performanceSignals?: import('./types.js').PerformanceSignal[];
  now?: Date;
}): { summary: string; insights: BensonInsight[]; blockedReasons: string[] } {
  const now = input.now ?? new Date();
  const blockedReasons: string[] = [];
  let insights = input.insights.filter((lesson) => {
    if (textContainsSuppressedEntity(`${lesson.insight} ${lesson.action}`, input.suppressions)) {
      blockedReasons.push(`suppressed:${lesson.id}`);
      return false;
    }
    if (textReferencesExpiredDate(`${lesson.insight} ${lesson.action}`, now)) {
      blockedReasons.push(`expired_date:${lesson.id}`);
      return false;
    }
    if (SPECIFIC_EVENT_RE.test(`${lesson.insight} ${lesson.action}`)) {
      if (
        input.timelyOpportunities.length === 0 ||
        !lessonMatchesTimelyOpportunity(lesson, input.timelyOpportunities)
      ) {
        blockedReasons.push(`ungrounded_event:${lesson.id}`);
        return false;
      }
    }
    if (!lesson.action?.trim() || lesson.action.trim().length < 12) {
      blockedReasons.push(`missing_action:${lesson.id}`);
      return false;
    }
    if (!lesson.evidenceSource?.trim() || !lesson.evidenceDateRange?.trim()) {
      blockedReasons.push(`missing_evidence:${lesson.id}`);
      return false;
    }
    return true;
  });

  insights = insights
    .map((lesson) => rejectPermanentProhibitionFromWeakEvidence(lesson))
    .filter((lesson): lesson is BensonInsight => lesson != null);

  insights = filterNovelLessons(insights, input.previousInsights);

  insights = applyMonetizationFirstCorrections(insights, {
    performanceSignals: input.performanceSignals,
  });

  return {
    summary: input.summary.trim(),
    insights,
    blockedReasons,
  };
}
