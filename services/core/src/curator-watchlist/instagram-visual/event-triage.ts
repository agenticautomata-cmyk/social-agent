/**
 * Cheap deterministic event-likelihood triage before expensive OCR/frames.
 * Empty/casual captions are NOT rejection (facts may be in the image).
 * Merely saying "event/party/tickets" is NOT acceptance.
 */

export type EventLikelihood = {
  score: number;
  signals: string[];
  prioritizeOcr: boolean;
  likelyFlyerOrRoundup: boolean;
};

const FLYER_HINT =
  /\b(?:flyer|poster|lineup|doors?\s*@|doors?\s+open|doors?\s+\d|all\s*ages|21\+|18\+|tickets?|rsvp|presale|ga\b|vip\b|showtime|live\s+music|concert|festival|roundup|this\s+weekend|tonight|saturday|friday|sunday)\b/i;

const DATE_HINT =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b20\d{2}\b|\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b/i;

const TIME_HINT = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i;

const CASUAL_ONLY =
  /^(?:😂|🔥|❤️|😍|🙏|🙌|💕|✨|\.+){0,6}$|^(?:lol|lmao|omg|same|mood|periodt)\.?$/i;

const WEAK_KEYWORD_ONLY = /^(?:event|party|tickets?|show|concert)\.?$/i;

export function triageEventLikelihood(input: {
  caption?: string | null;
  altTexts?: string[];
  mediaType?: string | null;
  carouselChildCount?: number;
  hashtags?: string[];
  priorPartial?: boolean;
  editedSinceLast?: boolean;
  notPreviouslyInspected?: boolean;
}): EventLikelihood {
  const signals: string[] = [];
  let score = 0.15;

  const caption = (input.caption ?? '').trim();
  const alts = (input.altTexts ?? []).join(' ');
  const tags = (input.hashtags ?? []).join(' ');
  const blob = `${caption}\n${alts}\n${tags}`;

  if (input.notPreviouslyInspected) {
    score += 0.12;
    signals.push('not_previously_inspected');
  }
  if (input.editedSinceLast) {
    score += 0.1;
    signals.push('edited_since_last');
  }
  if (input.priorPartial) {
    score += 0.15;
    signals.push('prior_partial');
  }

  if ((input.carouselChildCount ?? 0) > 1) {
    score += 0.18;
    signals.push('carousel');
  }
  if (input.mediaType === 'reel' || input.mediaType === 'single_video') {
    score += 0.08;
    signals.push('reel_or_video');
  }

  if (DATE_HINT.test(blob)) {
    score += 0.22;
    signals.push('date_text');
  }
  if (TIME_HINT.test(blob)) {
    score += 0.1;
    signals.push('time_text');
  }
  if (FLYER_HINT.test(blob)) {
    score += 0.2;
    signals.push('flyer_roundup_language');
  }

  // Caption empty or casual → still OCR; do not reject
  if (!caption || CASUAL_ONLY.test(caption) || caption.length < 8) {
    score += 0.05;
    signals.push('caption_thin_image_may_carry_facts');
  }

  // Weak keyword alone does not boost acceptance
  if (WEAK_KEYWORD_ONLY.test(caption) && !DATE_HINT.test(blob)) {
    score = Math.min(score, 0.35);
    signals.push('weak_keyword_only_not_enough');
  }

  score = Math.max(0, Math.min(1, score));
  const likelyFlyerOrRoundup =
    signals.includes('flyer_roundup_language') ||
    signals.includes('date_text') ||
    (input.carouselChildCount ?? 0) >= 3 ||
    score >= 0.45;

  return {
    score,
    signals,
    prioritizeOcr: likelyFlyerOrRoundup || !caption || caption.length < 40,
    likelyFlyerOrRoundup,
  };
}
