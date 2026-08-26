import type { BensonVoiceItem } from './benson-client.js';
import { escapeSsmlText } from './speech.js';

export const CONTINUATION_PAGE_SIZE = 3;
export const CONTINUATION_MAX_ITEMS = 36;
export const CONTINUATION_ATTR = 'bensonContinuation';

export type ContinuationKind = 'weekend_calendar' | 'weekend_list' | 'post_recommendations';

export type ContinuationItem = {
  title: string;
  day: string;
  time: string | null;
  venue: string | null;
  /** Compact why for post recommendations — never URLs/scores. */
  reason?: string | null;
};

export type ContinuationState = {
  type: ContinuationKind;
  offset: number;
  items: ContinuationItem[];
};

export type ContinuationPage = {
  speech: string;
  pageItems: ContinuationItem[];
  endSession: boolean;
  nextState: ContinuationState | null;
};

const ASK_FOR_MORE_RE = /\s*Ask for more if you want the rest\.?\s*$/i;

export function sanitizeContinuationItems(items: BensonVoiceItem[] | undefined): ContinuationItem[] {
  if (!items?.length) return [];
  const out: ContinuationItem[] = [];
  for (const raw of items) {
    if (out.length >= CONTINUATION_MAX_ITEMS) break;
    const title = raw.title?.trim();
    if (!title) continue;
    const reason = raw.reason?.trim() ? raw.reason.trim() : null;
    out.push({
      title,
      day: raw.day?.trim() ?? '',
      time: raw.time?.trim() ? raw.time.trim() : null,
      venue: raw.venue?.trim() ? raw.venue.trim() : null,
      ...(reason ? { reason } : {}),
    });
  }
  return out;
}

export function readContinuationState(raw: unknown): ContinuationState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (
    value.type !== 'weekend_calendar' &&
    value.type !== 'weekend_list' &&
    value.type !== 'post_recommendations'
  ) {
    return null;
  }
  if (typeof value.offset !== 'number' || !Number.isInteger(value.offset) || value.offset < 0) {
    return null;
  }
  if (!Array.isArray(value.items)) return null;
  const items = sanitizeContinuationItems(value.items as BensonVoiceItem[]);
  if (items.length === 0) return null;
  return { type: value.type, offset: value.offset, items };
}

function joinSpoken(items: ContinuationItem[]): string {
  const phrases = items.map((item) => {
    const title = escapeSsmlText(item.title);
    const venue = item.venue ? escapeSsmlText(item.venue) : '';
    return venue ? `${title} at ${venue}` : title;
  });
  if (phrases.length === 0) return '';
  if (phrases.length === 1) return phrases[0]!;
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}

function postItemPhrase(item: ContinuationItem): string {
  const title = escapeSsmlText(item.title);
  const reason = item.reason?.trim()
    ? escapeSsmlText(item.reason.trim())
    : item.day?.trim()
      ? escapeSsmlText(item.day.trim())
      : '';
  if (title && reason) {
    const reasonSentence = /[.!?]$/.test(reason) ? reason : `${reason}.`;
    return `${title}. ${reasonSentence}`;
  }
  return title;
}

export function firstPageSpeech(bensonSpeech: string, hasMore: boolean): string {
  const trimmed = bensonSpeech.trim();
  if (!hasMore) return trimmed;
  const withoutInvite = trimmed.replace(ASK_FOR_MORE_RE, '').trim().replace(/\.+$/, '');
  return `${withoutInvite}. Want to hear more?`;
}

export function continuationPageSpeech(pageItems: ContinuationItem[], hasMore: boolean): string {
  const listed = joinSpoken(pageItems);
  if (!listed) return hasMore ? 'Want to hear more?' : "That's the rest.";
  if (hasMore) {
    const lead = pageItems.length === 1 ? 'Next is' : 'The next few are';
    return `${lead} ${listed}. Want to hear more?`;
  }
  const lead = pageItems.length === 1 ? 'The last one is' : 'The last few are';
  return `${lead} ${listed}. That's the rest.`;
}

export function postRecommendationsMoreSpeech(pageItems: ContinuationItem[]): string {
  if (pageItems.length === 0) return "That's the rest.";
  if (pageItems.length === 1) {
    return `Also consider ${postItemPhrase(pageItems[0]!)} That's the rest.`;
  }
  const phrases = pageItems.map((item, index) => {
    const phrase = postItemPhrase(item);
    if (index === 0) return `Also consider ${phrase}`;
    if (index === pageItems.length - 1) return `And ${phrase}`;
    return phrase;
  });
  return `${phrases.join(' ')} That's the rest.`;
}

export function pageFromItems(
  kind: ContinuationKind,
  items: ContinuationItem[],
  offset: number,
  bensonSpeech?: string,
): ContinuationPage | null {
  if (offset < 0 || offset >= items.length) return null;

  if (kind === 'post_recommendations') {
    const pageItems = items.slice(offset);
    if (pageItems.length === 0) return null;
    return {
      speech: postRecommendationsMoreSpeech(pageItems),
      pageItems,
      endSession: true,
      nextState: null,
    };
  }

  const pageItems = items.slice(offset, offset + CONTINUATION_PAGE_SIZE);
  if (pageItems.length === 0) return null;
  const nextOffset = offset + pageItems.length;
  const hasMore = nextOffset < items.length;
  const isFirst = offset === 0;
  const speech =
    isFirst && bensonSpeech
      ? firstPageSpeech(bensonSpeech, hasMore)
      : continuationPageSpeech(pageItems, hasMore);
  return {
    speech,
    pageItems,
    endSession: !hasMore,
    nextState: hasMore ? { type: kind, offset: nextOffset, items } : null,
  };
}

export function startContinuation(
  kind: ContinuationKind,
  items: BensonVoiceItem[] | undefined,
  bensonSpeech: string,
): ContinuationPage {
  const sanitized = sanitizeContinuationItems(items);

  if (kind === 'post_recommendations') {
    const hasMore = sanitized.length > 1;
    return {
      speech: bensonSpeech.trim(),
      pageItems: sanitized,
      endSession: !hasMore,
      nextState: hasMore
        ? { type: 'post_recommendations', offset: 1, items: sanitized }
        : null,
    };
  }

  if (sanitized.length <= CONTINUATION_PAGE_SIZE) {
    return {
      speech: bensonSpeech.trim(),
      pageItems: sanitized,
      endSession: true,
      nextState: null,
    };
  }
  return pageFromItems(kind, sanitized, 0, bensonSpeech)!;
}
