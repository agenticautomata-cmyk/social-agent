/**
 * Strict pre-persistence event-quality gate.
 * Raw OCR never becomes an Event Lead without event intent + usable identity.
 */

import { assessOcrTitleQuality, isKnownGarbageTitle } from './ocr-quality.js';
import type { VisualEventCandidate } from './types.js';

export type EventQualityGateResult = {
  pass: boolean;
  queue: 'event_lead' | 'low_confidence_discovery' | 'reject' | 'non_event';
  reasons: string[];
};

const EVENT_INTENT =
  /\b(?:next\s+up|coming\s+up|join\s+us|don'?t\s+miss|live|festival|concert|show|class|workshop|party|market|performance|doors?|tickets?|rsvp|register|sign\s*up|free|tonight|tomorrow|weekend|this\s+friday|this\s+saturday)\b/i;

const REGISTRATION =
  /\b(?:tickets?|rsvp|register|registration|sign\s*up|presale|ga\b|vip\b)\b/i;

export function hasEventIntent(text: string | null | undefined): boolean {
  return EVENT_INTENT.test(text ?? '');
}

/**
 * Gate a visual candidate before persistence.
 * Requires: usable title + trustworthy future/review date + corroborating field
 * (venue, time, registration, or strong event-intent context).
 */
export function evaluateEventQualityGate(
  candidate: Pick<
    VisualEventCandidate,
    | 'title'
    | 'eventDate'
    | 'eventTime'
    | 'venue'
    | 'price'
    | 'ticketUrl'
    | 'originalQuotedText'
    | 'yearTrust'
    | 'temporalClass'
    | 'decisionStage'
    | 'fieldEvidence'
    | 'likelihoodScore'
  >,
  opts?: { caption?: string | null; postClassIsEvent?: boolean },
): EventQualityGateResult {
  const reasons: string[] = [];
  const title = candidate.title?.trim() ?? '';
  const evidenceBlob = [
    candidate.originalQuotedText,
    opts?.caption ?? '',
    ...candidate.fieldEvidence.map((e) => e.value),
  ].join('\n');

  if (!title) {
    return { pass: false, queue: 'reject', reasons: ['missing_title'] };
  }
  if (isKnownGarbageTitle(title)) {
    return { pass: false, queue: 'reject', reasons: ['known_garbage_title'] };
  }

  const ocrQ = assessOcrTitleQuality(title, {
    caption: opts?.caption,
    ocrConfidence: candidate.fieldEvidence.find((e) => e.field === 'title')?.confidence,
  });
  if (!ocrQ.usableAsTitle) {
    return {
      pass: false,
      queue: 'reject',
      reasons: ['ocr_gibberish', ...ocrQ.reasons],
    };
  }

  const corroborating =
    Boolean(candidate.venue?.trim()) ||
    Boolean(candidate.eventTime?.trim()) ||
    Boolean(candidate.ticketUrl) ||
    Boolean(candidate.price && /free|\$/i.test(candidate.price)) ||
    REGISTRATION.test(evidenceBlob) ||
    hasEventIntent(opts?.caption ?? '') ||
    hasEventIntent(candidate.originalQuotedText);

  const hasDate =
    Boolean(candidate.eventDate) &&
    (candidate.yearTrust === 'year_explicit' ||
      candidate.yearTrust === 'year_corroborated' ||
      candidate.yearTrust === 'year_inferred_review');

  // postClassIsEvent alone is not enough — need real intent language or corroborating fields
  const intent =
    hasEventIntent(evidenceBlob) ||
    hasEventIntent(opts?.caption) ||
    (opts?.postClassIsEvent === true && corroborating && hasEventIntent(evidenceBlob + '\n' + (opts?.caption ?? '')));

  if (!intent && candidate.temporalClass !== 'future') {
    reasons.push('weak_event_intent');
  }

  if (candidate.temporalClass === 'expired') {
    return { pass: false, queue: 'reject', reasons: ['expired'] };
  }

  // Full Event Lead path — require intent language (not merely postClassIsEvent)
  if (title && hasDate && corroborating && (hasEventIntent(evidenceBlob) || hasEventIntent(opts?.caption))) {
    if (
      candidate.yearTrust === 'year_inferred_review' ||
      candidate.temporalClass === 'review' ||
      candidate.decisionStage === 'review'
    ) {
      return {
        pass: true,
        queue: 'event_lead',
        reasons: ['pass_review_visible', ...reasons],
      };
    }
    return { pass: true, queue: 'event_lead', reasons: ['pass', ...reasons] };
  }

  // Strong event evidence but no trustworthy date → low-confidence discovery only
  if (title && ocrQ.usableAsTitle && intent && corroborating && !hasDate) {
    return {
      pass: false,
      queue: 'low_confidence_discovery',
      reasons: ['strong_intent_no_trustworthy_date'],
    };
  }

  if (!hasDate) reasons.push('missing_trustworthy_date');
  if (!corroborating) reasons.push('missing_corroborating_field');
  if (!intent) reasons.push('missing_event_intent');

  return { pass: false, queue: 'reject', reasons: reasons.length ? reasons : ['failed_quality_gate'] };
}

/** Strip assistant/research failure prose from public-facing fields. */
export function isResearchFailureProse(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return (
    /i couldn['’]?t locate/i.test(t) ||
    /could you please provide more details/i.test(t) ||
    /as an ai\b/i.test(t) ||
    /i(?:'| a)?m unable to (?:find|verify|locate)/i.test(t) ||
    /no (?:official )?results? (?:were )?found/i.test(t) ||
    /tool (?:error|failure|timed?\s*out)/i.test(t)
  );
}

export type ResearchToolOutcome =
  | 'confirmed'
  | 'partially_confirmed'
  | 'conflicting'
  | 'not_found'
  | 'blocked'
  | 'insufficient_evidence'
  | 'error';

export function classifyResearchToolOutcome(input: {
  ok?: boolean;
  summary?: string | null;
  citations?: number;
  hasOfficial?: boolean;
  hasConflict?: boolean;
}): ResearchToolOutcome {
  if (input.ok === false) return 'error';
  if (isResearchFailureProse(input.summary)) return 'not_found';
  if (input.hasConflict) return 'conflicting';
  if (input.hasOfficial) return 'confirmed';
  if ((input.citations ?? 0) > 0 && (input.summary?.length ?? 0) > 40) return 'partially_confirmed';
  if ((input.summary?.length ?? 0) < 20) return 'insufficient_evidence';
  return 'not_found';
}
