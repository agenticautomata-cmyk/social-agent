import type { CalendarAdmissionCandidate, CalendarAdmissionReasonCode } from '../types.js';

const GENERAL_ADMISSION_RE =
  /\b(?:general\s+admission|ga\s+tickets?|standing\s+admission|museum\s+admission|daily\s+admission)\b/i;

const HOURS_MEMBERSHIP_RE =
  /\b(?:hours\s+of\s+operation|operating\s+hours|regular\s+hours|membership(?:\s+pass)?|annual\s+pass|season\s+pass|gift\s+card|buy\s+tickets?\s+online)\b/i;

const PRODUCT_LANDING_RE =
  /\b(?:shop\s+now|add\s+to\s+cart|product\s+page|ticket\s+packages?|group\s+sales)\b/i;

const VENUE_HOMEPAGE_TITLE_RE =
  /^(?:home|welcome|about\s+us|visit\s+us|plan\s+your\s+visit)$/i;

const RECURRING_ACCESS_RE =
  /\b(?:unlimited\s+visits|come\s+anytime|open\s+daily|every\s+day\s+admission)\b/i;

export type EventnessGateResult = {
  ok: boolean;
  reason: CalendarAdmissionReasonCode | null;
  detail: string;
  eventnessEvidence: string[];
};

/**
 * Discrete occurrence vs ordinary admission / hours / membership / product / venue homepage.
 */
export function evaluateEventnessGate(c: CalendarAdmissionCandidate): EventnessGateResult {
  const title = (c.title ?? '').trim();
  const hay = `${title}\n${c.summary ?? ''}\n${c.description ?? ''}\n${c.category ?? ''}`;
  const evidence: string[] = [];

  if (GENERAL_ADMISSION_RE.test(title) || GENERAL_ADMISSION_RE.test(hay)) {
    // Allow titled programs that merely mention GA pricing.
    if (/general\s+admission/i.test(title) && !/\b(?:night|show|concert|festival|party|fair|market|workshop|tour)\b/i.test(title)) {
      evidence.push('general_admission_title');
      return {
        ok: false,
        reason: 'not_a_discrete_event',
        detail: 'standing_general_admission',
        eventnessEvidence: evidence,
      };
    }
  }

  if (HOURS_MEMBERSHIP_RE.test(title)) {
    evidence.push('hours_or_membership_title');
    return {
      ok: false,
      reason: 'not_a_discrete_event',
      detail: 'hours_or_membership',
      eventnessEvidence: evidence,
    };
  }

  if (PRODUCT_LANDING_RE.test(title)) {
    evidence.push('product_landing');
    return {
      ok: false,
      reason: 'not_a_discrete_event',
      detail: 'product_or_ticket_landing',
      eventnessEvidence: evidence,
    };
  }

  if (VENUE_HOMEPAGE_TITLE_RE.test(title)) {
    evidence.push('venue_homepage');
    return {
      ok: false,
      reason: 'not_a_discrete_event',
      detail: 'venue_homepage',
      eventnessEvidence: evidence,
    };
  }

  if (RECURRING_ACCESS_RE.test(title) && !/\b(?:special|tonight|this\s+(?:friday|saturday|sunday|weekend))\b/i.test(hay)) {
    evidence.push('recurring_access');
    return {
      ok: false,
      reason: 'not_a_discrete_event',
      detail: 'recurring_access_without_program',
      eventnessEvidence: evidence,
    };
  }

  evidence.push('discrete_or_unknown');
  return { ok: true, reason: null, detail: 'eventness_ok', eventnessEvidence: evidence };
}
