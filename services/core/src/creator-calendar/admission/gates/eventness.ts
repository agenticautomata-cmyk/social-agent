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

/** Merchandise / product drops — not attendable public occurrences. */
const MERCHANDISE_RE =
  /\b(?:limited\s+edition|tee(?:shirt)?s?\b|t-?shirts?\b|hoodie|merch(?:andise)?|swag\s+drop|product\s+drop|shop\s+the\s+drop|pre-?order\s+now)\b/i;

/** News / development / apartment announcements. */
const NEWS_NOT_EVENT_RE =
  /\b(?:hundreds\s+of\s+apartments|proposed\s+next\s+to|development\s+plan|demolition\s+plan|city\s+council\s+approves|breaking:|report(?:s|ed)?:|according\s+to\s+(?:sources|officials))\b/i;

/** Standing promotions / outlet mall ongoing offers. */
const PROMOTION_NOT_EVENT_RE =
  /\b(?:ongoing\s+promotions?|current\s+promotions?|store\s+promotions?|outlet\s+promotions?|always\s+on\s+sale|everyday\s+savings)\b/i;

/** Contests / submissions / photo contests without a bounded attendable start. */
const CONTEST_NOT_EVENT_RE =
  /\b(?:photo\s+contest|enter\s+(?:the|our)\s+contest|submit\s+(?:your|entries)|call\s+for\s+(?:entries|submissions)|contest\s+ends|sweepstakes)\b/i;

/** Newsletter intros / foundation messages / announcement blurbs. */
const ANNOUNCEMENT_NOT_EVENT_RE =
  /\b(?:a\s+message\s+from\s+the|letter\s+from\s+the\s+(?:director|foundation|board)|newsletter\s+intro|from\s+our\s+foundation|dear\s+(?:friends|members|supporters))\b/i;

/** Ticket-search / attraction-hours landing pages. */
const TICKET_SEARCH_LANDING_RE =
  /\b(?:find\s+tickets|search\s+tickets|tickets?\s+from\s+\$|compare\s+ticket\s+prices)\b/i;

const ARTICLE_ABOUT_EVENT_RE =
  /\b(?:to\s+play\s+(?:upstate|downtown)|confronts\s+the|video\s+goes\s+viral|what\s+to\s+know\s+about)\b/i;

const DISCRETE_OCCURRENCE_HINT_RE =
  /\b(?:concert|show|festival|fair|market|meetup|meet-?up|workshop|class|party|gala|game|match|screening|reading|tour|brunch|open\s+mic|art\s+walk|hike|meeting|seminar|night|live)\b/i;

export type EventnessGateResult = {
  ok: boolean;
  reason: CalendarAdmissionReasonCode | null;
  detail: string;
  eventnessEvidence: string[];
};

/**
 * Discrete occurrence vs merchandise / news / promo / contest / GA / hours / product.
 * Deterministic structured signals first; title patterns second.
 */
export function evaluateEventnessGate(c: CalendarAdmissionCandidate): EventnessGateResult {
  const title = (c.title ?? '').trim();
  const hay = `${title}\n${c.summary ?? ''}\n${c.description ?? ''}\n${c.category ?? ''}`;
  const evidence: string[] = [];
  const ingest = (c.ingest ?? '').toLowerCase();
  const category = (c.category ?? '').toLowerCase();

  // Structured ingest/category signals before title heuristics.
  if (
    /product_release|merchandise|merch_drop|shopify|ecommerce/i.test(ingest) ||
    /product_release|merchandise/i.test(category)
  ) {
    evidence.push('structured:merchandise_ingest');
    return {
      ok: false,
      reason: 'merchandise_not_event',
      detail: 'structured_merchandise',
      eventnessEvidence: evidence,
    };
  }
  if (
    /metro_openings_rss|news_rss|press_release/i.test(ingest) &&
    (NEWS_NOT_EVENT_RE.test(title) || ANNOUNCEMENT_NOT_EVENT_RE.test(title) || CONTEST_NOT_EVENT_RE.test(title))
  ) {
    if (NEWS_NOT_EVENT_RE.test(title)) {
      evidence.push('structured:news_rss');
      return {
        ok: false,
        reason: 'news_not_event',
        detail: 'rss_development_news',
        eventnessEvidence: evidence,
      };
    }
    if (ANNOUNCEMENT_NOT_EVENT_RE.test(title)) {
      evidence.push('structured:announcement_rss');
      return {
        ok: false,
        reason: 'announcement_not_event',
        detail: 'rss_newsletter_announcement',
        eventnessEvidence: evidence,
      };
    }
    if (CONTEST_NOT_EVENT_RE.test(title)) {
      evidence.push('structured:contest_rss');
      return {
        ok: false,
        reason: 'contest_not_event',
        detail: 'rss_contest_without_attendance',
        eventnessEvidence: evidence,
      };
    }
  }
  if (/ongoing.?promo|promotion_feed/i.test(ingest) || PROMOTION_NOT_EVENT_RE.test(title)) {
    if (!DISCRETE_OCCURRENCE_HINT_RE.test(title) || PROMOTION_NOT_EVENT_RE.test(title)) {
      evidence.push('structured_or_title:promotion');
      return {
        ok: false,
        reason: 'promotion_not_event',
        detail: 'standing_promotion',
        eventnessEvidence: evidence,
      };
    }
  }

  if (MERCHANDISE_RE.test(title) && !DISCRETE_OCCURRENCE_HINT_RE.test(title)) {
    evidence.push('merchandise_title');
    return {
      ok: false,
      reason: 'merchandise_not_event',
      detail: 'merchandise_or_product_drop',
      eventnessEvidence: evidence,
    };
  }

  if (NEWS_NOT_EVENT_RE.test(title)) {
    evidence.push('news_headline_title');
    return {
      ok: false,
      reason: 'news_not_event',
      detail: 'news_or_development_headline',
      eventnessEvidence: evidence,
    };
  }

  if (PROMOTION_NOT_EVENT_RE.test(title)) {
    evidence.push('promotion_title');
    return {
      ok: false,
      reason: 'promotion_not_event',
      detail: 'ongoing_promotion',
      eventnessEvidence: evidence,
    };
  }

  if (CONTEST_NOT_EVENT_RE.test(title)) {
    // Contests/submissions are not Calendar events unless explicitly an awards ceremony / reception.
    if (!/\b(?:awards?\s+ceremony|winner(?:s)?\s+reception|gallery\s+opening)\b/i.test(title)) {
      evidence.push('contest_title');
      return {
        ok: false,
        reason: 'contest_not_event',
        detail: 'contest_or_submission_drive',
        eventnessEvidence: evidence,
      };
    }
  }

  if (ANNOUNCEMENT_NOT_EVENT_RE.test(title)) {
    evidence.push('announcement_title');
    return {
      ok: false,
      reason: 'announcement_not_event',
      detail: 'newsletter_or_foundation_message',
      eventnessEvidence: evidence,
    };
  }

  if (TICKET_SEARCH_LANDING_RE.test(title)) {
    evidence.push('ticket_search_landing');
    return {
      ok: false,
      reason: 'not_a_discrete_event',
      detail: 'ticket_search_landing',
      eventnessEvidence: evidence,
    };
  }

  if (ARTICLE_ABOUT_EVENT_RE.test(title) && !DISCRETE_OCCURRENCE_HINT_RE.test(title)) {
    evidence.push('article_about_event');
    return {
      ok: false,
      reason: 'news_not_event',
      detail: 'article_about_event',
      eventnessEvidence: evidence,
    };
  }

  if (GENERAL_ADMISSION_RE.test(title) || GENERAL_ADMISSION_RE.test(hay)) {
    // Allow titled programs that merely mention GA pricing.
    if (/general\s+admission/i.test(title) && !DISCRETE_OCCURRENCE_HINT_RE.test(title)) {
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
