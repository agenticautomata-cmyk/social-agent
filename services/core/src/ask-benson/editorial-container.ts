/**
 * Parent-page vs child-event classification for editorial roundups, guides,
 * listing hubs, and multi-event schedules. Structure/schema/entity count
 * outrank title keywords.
 */

import type { ExtractedOpportunity } from './listing-extract.js';
import { parseEventDate } from './listing-extract.js';
import { composeJsonLdOpportunityDates, parseJsonLdPageGraph, type JsonLdEvent } from './jsonld-events.js';

export type EditorialContainerKind =
  | 'editorial_article'
  | 'roundup'
  | 'listing_hub'
  | 'destination_guide'
  | 'multi_event_schedule';

export type EditorialContainerClassification = {
  isContainer: boolean;
  kind: EditorialContainerKind | null;
  parentRepresentsSingleEvent: boolean;
  evidence: string[];
  jsonLdEventCount: number;
  datedMentionCount: number;
  extractedChildCount: number;
  hasArticleSchema: boolean;
};

const CONTAINER_TITLE_RE =
  /\b(?:events?\s+archive\b|events?\s+in\b|things\s+to\s+do\b|where\s+to\s+(?:eat|shop|play|stay|explore)\b|spend\s+a\s+day\s+in\b|guide\s+to\b|best\s+things\b|weekend\s+roundup\b|roundup\s+of\b|what\s+to\s+do\s+(?:this|in)\b|neighborhoods?\b|eat,?\s*shop,?\s*(?:and\s+)?play\b)/i;

const SCHEDULE_TITLE_RE =
  /\bschedule\s+(?:20\d{2}\s*[-–—]\s*)?20\d{2}\b|\b(?:20\d{2}\s*[-–—]\s*20\d{2})\s*schedule\b|\bfamily\s+shows?\b/i;

const CONTAINER_PATH_RE =
  /\/(?:top[-_])?things[-_]to[-_]do\b|\/(?:best[-_]of|weekend[-_]guide|city[-_]guide|neighborhoods?)\b|\b(?:roundup|listicle)\b|\/what[-_]to[-_]do\b|\/events?(?:\/|$)|\/calendar(?:\/|$)|\/schedule(?:\/|$)/i;

const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const DATED_MENTION_RE = new RegExp(`\\b(?:${MONTH})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*20\\d{2})?\\b`, 'gi');

const YEAR_ONLY_RE = /^\s*20\d{2}\s*$/;
const YEAR_RANGE_RE = /^\s*20\d{2}\s*[-–—]\s*20\d{2}\s*$/;

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&amp;|&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titlesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

export function looksLikeEditorialContainerTitle(title: string | null | undefined): boolean {
  const t = (title ?? '').trim();
  if (!t) return false;
  if (CONTAINER_TITLE_RE.test(t)) return true;
  if (SCHEDULE_TITLE_RE.test(t)) return true;
  if (/^.+:\s+where\s+to\s+/i.test(t)) return true;
  return false;
}

/** Page-level archive / hub titles that must not be treated as a single event. */
export function isPageLevelArchiveTitle(title: string | null | undefined): boolean {
  const t = (title ?? '').trim();
  if (!t) return false;
  if (/\bevents?\s+archive\b/i.test(t)) return true;
  return looksLikeEditorialContainerTitle(t);
}

export function looksLikeEditorialContainerUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
    if (CONTAINER_PATH_RE.test(path)) return true;
    return parsed.pathname.split('/').filter(Boolean).some((seg) =>
      /things[-_]?to[-_]?do|roundup|listicle|weekend[-_]?guide|best[-_]of|neighborhood|schedule/.test(seg),
    );
  } catch {
    return false;
  }
}

export function countDatedMentions(text: string | null | undefined): number {
  if (!text) return 0;
  const hits = text.match(DATED_MENTION_RE) ?? [];
  return new Set(hits.map((h) => h.toLowerCase().replace(/\s+/g, ' '))).size;
}

export function isInventedArticleDate(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const value = raw.trim();
  if (YEAR_ONLY_RE.test(value) || YEAR_RANGE_RE.test(value)) return true;
  if (/schedule\s+20\d{2}/i.test(value)) return true;
  return false;
}

/** Year-only / year-range / parser-midnight is not evidence that a parent article is an event. */
export function isFallbackMidnightDate(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return true;
  if (isInventedArticleDate(raw)) return true;
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  const parsed = parseEventDate(value);
  if (!parsed) return true;
  const midnight =
    parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0;
  if (!midnight) return false;
  return !/\b(?:[1-9]|0?[1-9]|1[0-2]):[0-5]\d\s*(?:am|pm)\b/i.test(value) && !/T(?:[1-9]\d|0[1-9]):[0-5]\d/.test(value);
}

export function hasConcreteChildDate(raw: string | null | undefined): boolean {
  if (!raw?.trim() || isInventedArticleDate(raw)) return false;
  return parseEventDate(raw) != null;
}

function isEventItemPath(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\/events?(?:[-_][\w]+)?\/.+/.test(path) || /\/calendar\/.+/.test(path);
  } catch {
    return false;
  }
}

function isEventIndexPath(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/\/+$/, '') || '/';
    return /\/events?$/.test(path) || /\/calendar$/.test(path) || /\/schedule$/.test(path);
  } catch {
    return false;
  }
}

export function classifyEditorialContainer(input: {
  url?: string | null;
  title?: string | null;
  pageText?: string | null;
  jsonLdEvents?: JsonLdEvent[];
  extractedTitles?: string[];
  hasArticleSchema?: boolean;
}): EditorialContainerClassification {
  const evidence: string[] = [];
  const graph = parseJsonLdPageGraph(input.pageText ?? '');
  const jsonLdEvents = input.jsonLdEvents ?? graph.events;
  const jsonLdEventCount = jsonLdEvents.length;
  const datedMentionCount = countDatedMentions(`${input.title ?? ''} ${input.pageText ?? ''}`);
  const extractedChildCount = (input.extractedTitles ?? []).filter((t) => !titlesMatch(t, input.title)).length;
  const hasArticleSchema = input.hasArticleSchema ?? graph.hasArticleSchema;
  const titleCue = looksLikeEditorialContainerTitle(input.title);
  const urlCue = looksLikeEditorialContainerUrl(input.url);
  const indexPath = isEventIndexPath(input.url);
  const itemPath = isEventItemPath(input.url);

  if (titleCue) evidence.push('container_title');
  if (urlCue) evidence.push('container_url');
  if (indexPath) evidence.push('listing_index_path');
  if (hasArticleSchema && jsonLdEventCount !== 1) evidence.push('article_schema');
  if (jsonLdEventCount >= 2) evidence.push('multiple_jsonld_events');
  if (datedMentionCount >= 3) evidence.push('multiple_dated_blocks');
  if (extractedChildCount >= 2) evidence.push('multiple_extracted_entities');

  let kind: EditorialContainerKind | null = null;
  if (SCHEDULE_TITLE_RE.test(input.title ?? '') || datedMentionCount >= 5) kind = 'multi_event_schedule';
  else if (/\bspend\s+a\s+day\b|\bneighborhoods?\b|where\s+to\s+(?:eat|shop|play)/i.test(input.title ?? '')) {
    kind = 'destination_guide';
  } else if (indexPath || /\bevents?\s+in\b/i.test(input.title ?? '')) kind = 'listing_hub';
  else if (urlCue || /\broundup\b|things\s+to\s+do|best\s+things/i.test(input.title ?? '')) kind = 'roundup';
  else if (hasArticleSchema || titleCue) kind = 'editorial_article';

  const strongContainer =
    jsonLdEventCount >= 2 ||
    extractedChildCount >= 2 ||
    datedMentionCount >= 4 ||
    (titleCue && (datedMentionCount >= 2 || jsonLdEventCount !== 1 || hasArticleSchema || datedMentionCount === 0)) ||
    (indexPath && !itemPath) ||
    (hasArticleSchema && datedMentionCount >= 2);

  const singleEmbeddedEvent =
    jsonLdEventCount === 1 &&
    !titlesMatch(jsonLdEvents[0]?.name, input.title) &&
    (hasArticleSchema || titleCue);

  const parentRepresentsSingleEvent =
    !indexPath &&
    jsonLdEventCount <= 1 &&
    extractedChildCount <= 1 &&
    datedMentionCount <= 2 &&
    !titleCue &&
    (itemPath || (graph.hasEventSchema && !hasArticleSchema) || (!hasArticleSchema && !urlCue && jsonLdEventCount === 1));

  const isContainer =
    Boolean(kind) &&
    (strongContainer || titleCue || singleEmbeddedEvent || (urlCue && !parentRepresentsSingleEvent)) &&
    !parentRepresentsSingleEvent;

  if (singleEmbeddedEvent) {
    evidence.push('embedded_event_in_article');
    kind = kind ?? 'editorial_article';
  }

  return {
    isContainer: isContainer || singleEmbeddedEvent,
    kind: isContainer || singleEmbeddedEvent ? kind ?? 'editorial_article' : null,
    parentRepresentsSingleEvent: parentRepresentsSingleEvent && !singleEmbeddedEvent && !titleCue,
    evidence,
    jsonLdEventCount,
    datedMentionCount,
    extractedChildCount,
    hasArticleSchema,
  };
}

export function jsonLdEventsToOpportunities(
  events: JsonLdEvent[],
  parentUrl: string,
  publisher?: string | null,
): ExtractedOpportunity[] {
  return events.map((ev) => {
    const { eventDate, eventEndDate } = composeJsonLdOpportunityDates(ev);
    return {
      title: ev.name,
      summary: ev.description,
      location: ev.city ?? ev.address,
      venue: ev.venue,
      businessName: ev.venue,
      eventDate,
      eventEndDate,
      category: 'local_event',
      sourceUrl: ev.url || parentUrl,
      tags: ['jsonld_event'],
      confidence: 0.86,
      parentArticleUrl: parentUrl,
      city: ev.city,
      address: ev.address,
      publisher: ev.publisher ?? publisher ?? null,
      startTime: ev.startTime,
    };
  });
}

export function attachParentProvenance(
  opp: ExtractedOpportunity,
  parent: { url: string; publisher?: string | null },
): ExtractedOpportunity {
  return {
    ...opp,
    sourceUrl: opp.sourceUrl?.trim() || parent.url,
    parentArticleUrl: opp.parentArticleUrl ?? parent.url,
    publisher: opp.publisher ?? parent.publisher ?? null,
  };
}

export function isCalendarEligibleChild(
  opp: Pick<ExtractedOpportunity, 'title' | 'eventDate' | 'venue' | 'location' | 'startTime'>,
  parentTitle?: string | null,
): boolean {
  const title = opp.title?.trim() ?? '';
  if (title.length < 4) return false;
  if (titlesMatch(title, parentTitle)) return false;
  if (looksLikeEditorialContainerTitle(title)) return false;
  return hasConcreteChildDate(opp.eventDate ?? null);
}

export function mergeExtractedOpportunities(
  primary: ExtractedOpportunity[],
  secondary: ExtractedOpportunity[],
): ExtractedOpportunity[] {
  const out: ExtractedOpportunity[] = [];
  const seen = new Set<string>();
  for (const opp of [...primary, ...secondary]) {
    const key = `${normalizeTitle(opp.title)}|${(opp.eventDate ?? '').slice(0, 10)}|${normalizeTitle(opp.venue)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(opp);
    if (out.length >= 40) break;
  }
  return out;
}

export function decomposeEditorialOpportunities(input: {
  opportunities: ExtractedOpportunity[];
  parentTitle?: string | null;
  parentUrl: string;
  publisher?: string | null;
  container: EditorialContainerClassification;
}): ExtractedOpportunity[] {
  const withProvenance = input.opportunities.map((opp) =>
    attachParentProvenance(opp, { url: input.parentUrl, publisher: input.publisher }),
  );
  if (!input.container.isContainer || input.container.parentRepresentsSingleEvent) {
    return withProvenance;
  }

  const children = withProvenance.filter((opp) => isCalendarEligibleChild(opp, input.parentTitle));
  if (children.length > 0) return children;

  const parent =
    withProvenance.find((opp) => titlesMatch(opp.title, input.parentTitle)) ??
    (input.parentTitle?.trim()
      ? {
          title: input.parentTitle.trim(),
          summary: null,
          location: null,
          venue: null,
          businessName: null,
          eventDate: null,
          eventEndDate: null,
          category: 'editorial_guide',
          sourceUrl: input.parentUrl,
          tags: ['editorial_container'],
          confidence: 0.5,
          parentArticleUrl: input.parentUrl,
          publisher: input.publisher ?? null,
        }
      : null);
  if (!parent) return [];
  return [{ ...parent, eventDate: null, eventEndDate: null, startTime: null }];
}
