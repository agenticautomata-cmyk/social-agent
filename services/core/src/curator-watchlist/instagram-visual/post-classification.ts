/**
 * Classify an Instagram post evidence bundle before event assembly.
 * Broken OCR fragments must not become independent events.
 */

import { isInstagramErrorChrome } from './ig-error-chrome.js';

export type InstagramPostContentClass =
  | 'single_event'
  | 'multi_event_roundup'
  | 'promotion_offer'
  | 'human_interest_story'
  | 'past_event_recap'
  | 'general_announcement'
  | 'non_event'
  | 'acquisition_error_chrome'
  | 'unknown';

export type PostClassification = {
  contentClass: InstagramPostContentClass;
  confidence: number;
  signals: string[];
  isEventBearing: boolean;
};

const EVENT_INTENT =
  /\b(?:next\s+up|coming\s+up|join\s+us|don'?t\s+miss|live\s+(?:at|on|music)|festival|concert|show|class|workshop|party|market|performance|doors?\s*(?:@|open)|tickets?|rsvp|register|sign\s*up|free\s+\w+|this\s+weekend|tonight|tomorrow)\b/i;

const ROUNDUP =
  /\b(?:weekend\s+roundup|events?\s+this\s+weekend|kc\s+events?|kansas\s*city\s+events?|lineup|what'?s\s+on|events?\s+in\s+black\s+spaces|this\s+weekend)\b/i;

const STORY_NEWS =
  /\b(?:the\s+moment|learned\s+(?:his|her|their)|years?\s+of\s+rent|award(?:ed)?|winner|congratulations|proud\s+to\s+announce|story\s+of|meet\s+\w+|spotlight)\b/i;

const RECAP =
  /\b(?:recap|last\s+(?:night|week|weekend)|thanks\s+to\s+everyone|what\s+a\s+night|throwback|yesterday'?s|wrapped\s+up)\b/i;

const PROMO =
  /\b(?:sale|discount|%?\s*off|giveaway|sweepstakes|merch\s+drop|new\s+menu|now\s+open|grand\s+opening)\b/i;

const DATEISH =
  /\b(?:jan(?:uary)?|feb(?:uary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}|\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b|\b\d{1,2}\/\d{1,2}\b/i;

const TIMEISH = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;

export function classifyInstagramPostContent(input: {
  caption?: string | null;
  altTexts?: string[];
  ocrTexts?: string[];
  hashtags?: string[];
}): PostClassification {
  const signals: string[] = [];
  const caption = (input.caption ?? '').trim();
  const ocrBlob = (input.ocrTexts ?? []).join('\n');
  const altBlob = (input.altTexts ?? []).join('\n');
  const tags = (input.hashtags ?? []).join(' ');
  const blob = `${caption}\n${ocrBlob}\n${altBlob}\n${tags}`;

  if (isInstagramErrorChrome(caption) || isInstagramErrorChrome(ocrBlob.slice(0, 240))) {
    return {
      contentClass: 'acquisition_error_chrome',
      confidence: 0.95,
      signals: ['error_chrome'],
      isEventBearing: false,
    };
  }

  // Human-interest / award stories — even if OCR mentions dates
  if (STORY_NEWS.test(caption) && !EVENT_INTENT.test(caption)) {
    signals.push('human_interest_language');
    return {
      contentClass: 'human_interest_story',
      confidence: 0.85,
      signals,
      isEventBearing: false,
    };
  }

  if (RECAP.test(caption)) {
    signals.push('recap_language');
    return {
      contentClass: 'past_event_recap',
      confidence: 0.8,
      signals,
      isEventBearing: false,
    };
  }

  if (PROMO.test(caption) && !EVENT_INTENT.test(caption) && !DATEISH.test(caption)) {
    signals.push('promotion_language');
    return {
      contentClass: 'promotion_offer',
      confidence: 0.7,
      signals,
      isEventBearing: false,
    };
  }

  if (ROUNDUP.test(blob)) {
    signals.push('roundup_language');
    return {
      contentClass: 'multi_event_roundup',
      confidence: 0.8,
      signals,
      isEventBearing: true,
    };
  }

  const intent = EVENT_INTENT.test(blob);
  const dated = DATEISH.test(blob);
  const flyerOcr =
    /\b(?:doors?\s*(?:@|open|\d)|all\s*ages|21\+|tickets?|showtime|live\s+music|rock\s+the|lineup)\b/i.test(
      ocrBlob,
    ) || (input.ocrTexts ?? []).some((t) => t.length > 40 && DATEISH.test(t) && TIMEISH.test(t));

  if (intent && dated) {
    signals.push('event_intent', 'date_signal');
    return {
      contentClass: 'single_event',
      confidence: 0.9,
      signals,
      isEventBearing: true,
    };
  }
  if (flyerOcr) {
    signals.push('flyer_ocr_signals');
    // Multiple distinct day headings → roundup; else single flyer event
    const dayHeads = (ocrBlob.match(
      /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    ) ?? []).length;
    if (dayHeads >= 2 || ROUNDUP.test(blob)) {
      return {
        contentClass: 'multi_event_roundup',
        confidence: 0.75,
        signals,
        isEventBearing: true,
      };
    }
    return {
      contentClass: 'single_event',
      confidence: 0.75,
      signals,
      isEventBearing: true,
    };
  }
  if (intent) {
    signals.push('event_intent');
    return {
      contentClass: 'single_event',
      confidence: 0.7,
      signals,
      isEventBearing: true,
    };
  }
  if (dated && /\b(?:at|in|@)\s+[A-Z]/.test(caption)) {
    signals.push('date_and_location');
    return {
      contentClass: 'single_event',
      confidence: 0.65,
      signals,
      isEventBearing: true,
    };
  }

  if (!caption && ocrBlob.length < 20) {
    return {
      contentClass: 'unknown',
      confidence: 0.3,
      signals: ['thin_evidence'],
      isEventBearing: false,
    };
  }

  if (caption.length > 40 && !dated && !intent) {
    signals.push('caption_without_event_markers');
    return {
      contentClass: 'general_announcement',
      confidence: 0.55,
      signals,
      isEventBearing: false,
    };
  }

  return {
    contentClass: 'non_event',
    confidence: 0.4,
    signals: signals.length ? signals : ['no_event_markers'],
    isEventBearing: false,
  };
}
