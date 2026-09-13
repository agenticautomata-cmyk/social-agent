/**
 * Evidence-aware multi-slide event assembly.
 * Do NOT: treat roundup title as sole event; cross-assign unrelated venues;
 * one vague event for whole roundup; fabricate slide URLs.
 */

import { resolveEventDateWithYearTrust } from './date-year-trust.js';
import { isInstagramErrorChrome, isInstagramErrorChromeTitle } from './ig-error-chrome.js';
import { assessLocationTrust } from './location-trust.js';
import type {
  AcquiredInstagramMedia,
  FieldEvidence,
  SlideOcrEvidence,
  VisualEventCandidate,
} from './types.js';

const ROUNDUP_TITLE =
  /\b(?:kansas\s*city\s+events?\s+in\s+black\s+spaces|kc\s+events?\s+(?:this\s+)?weekend|weekend\s+roundup|events?\s+this\s+weekend)\b/i;

const DAY_HEADING =
  /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;

const TIME_RANGE_RE =
  /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\s*[–\-—to]+\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b/;
const TIME_RE = /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b/;
const PRICE_RE = /\$\s?\d+(?:\.\d{2})?|\bfree\b|\bdonation\b/i;
const AGE_RE = /\b(all\s*ages|21\+|18\+|16\+)\b/i;

function extractHashtags(text: string): string[] {
  return [...text.matchAll(/#([\w.]+)/g)].map((m) => m[1]!).slice(0, 30);
}

function isRoundupCoverTitle(text: string): boolean {
  const line = text.split(/\n/)[0]?.trim() ?? text.trim();
  return ROUNDUP_TITLE.test(line) || ROUNDUP_TITLE.test(text.slice(0, 120));
}

function parseLines(text: string): string[] {
  return text
    .split(/\n+|•|\u2022/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3);
}

function pushEvidence(
  list: FieldEvidence[],
  field: string,
  value: string | null | undefined,
  source: FieldEvidence['source'],
  slideNumber?: number,
  confidence?: number,
): void {
  if (!value?.trim()) return;
  list.push({
    field,
    value: value.trim(),
    source,
    slideNumber: slideNumber ?? null,
    confidence: confidence ?? null,
  });
}

function candidateFromSlideText(input: {
  slideNumber: number;
  text: string;
  confidence: number;
  permalink: string;
  caption: string | null;
  locationTag: string | null;
  handle: string;
  publishedAt: string | null;
  dayHeading: string | null;
}): VisualEventCandidate | null {
  if (isInstagramErrorChrome(input.text) || isInstagramErrorChrome(input.caption)) {
    return null;
  }
  const lines = parseLines(input.text);
  if (lines.length === 0) return null;

  // Skip cover-only roundup titles with no event facts
  if (isRoundupCoverTitle(input.text) && !TIME_RE.test(input.text) && lines.length <= 3) {
    return null;
  }

  let dayHeading = input.dayHeading;
  let titleLine: string | null = null;
  let subtitle: string | null = null;
  for (const line of lines) {
    if (DAY_HEADING.test(line) && line.length < 40) {
      dayHeading = line;
      continue;
    }
    if (isRoundupCoverTitle(line)) continue;
    if (isInstagramErrorChromeTitle(line)) continue;
    if (!titleLine && line.length >= 4 && line.length < 160) {
      titleLine = line;
      continue;
    }
    if (
      titleLine &&
      !subtitle &&
      line.length >= 4 &&
      line.length < 120 &&
      !TIME_RE.test(line) &&
      !/\b\d{2,5}\s+[A-Za-z]/.test(line) &&
      !DAY_HEADING.test(line)
    ) {
      subtitle = line;
    }
  }
  if (!titleLine) return null;
  // Reject chrome / garbage OCR that is not an event title
  if (
    isInstagramErrorChromeTitle(titleLine) ||
    /^(?:subscribe|follow|like|share|more|options|log\s*in)$/i.test(titleLine) ||
    titleLine.replace(/[^a-z0-9]/gi, '').length < 4 ||
    /^[\W\d\s|_\\\/.-]{0,20}$/.test(titleLine)
  ) {
    return null;
  }

  const evidence: FieldEvidence[] = [];
  pushEvidence(evidence, 'title', titleLine, 'slide_ocr', input.slideNumber, input.confidence);
  if (subtitle) pushEvidence(evidence, 'subtitle', subtitle, 'slide_ocr', input.slideNumber);
  pushEvidence(evidence, 'dayHeading', dayHeading, 'slide_ocr', input.slideNumber);

  const range = input.text.match(TIME_RANGE_RE);
  const time = range?.[1] ?? input.text.match(TIME_RE)?.[1] ?? null;
  const endTime = range?.[2] ?? null;
  pushEvidence(evidence, 'eventTime', time, 'slide_ocr', input.slideNumber);
  if (endTime) pushEvidence(evidence, 'endTime', endTime, 'slide_ocr', input.slideNumber);

  const price = input.text.match(PRICE_RE)?.[0] ?? null;
  pushEvidence(evidence, 'price', price, 'slide_ocr', input.slideNumber);

  const age = input.text.match(AGE_RE)?.[1] ?? null;
  pushEvidence(evidence, 'ageRestriction', age, 'slide_ocr', input.slideNumber);

  const dateTrust = resolveEventDateWithYearTrust({
    text: `${dayHeading ?? ''} ${input.text} ${input.caption ?? ''}`,
    postPublishedAt: input.publishedAt,
  });
  if (dateTrust.isoDate) {
    pushEvidence(evidence, 'eventDate', dateTrust.isoDate, 'slide_ocr', input.slideNumber);
  }
  pushEvidence(evidence, 'yearTrust', dateTrust.yearTrust, 'slide_ocr', input.slideNumber);
  pushEvidence(evidence, 'yearInference', dateTrust.explanation, 'slide_ocr', input.slideNumber);

  const loc = assessLocationTrust({
    flyerText: input.text,
    caption: input.caption,
    locationTag: input.locationTag,
    curatorHandle: input.handle,
  });
  if (loc.venue) pushEvidence(evidence, 'venue', loc.venue, 'slide_ocr', input.slideNumber);
  if (loc.address) pushEvidence(evidence, 'address', loc.address, 'slide_ocr', input.slideNumber);
  if (input.locationTag) {
    pushEvidence(evidence, 'locationTag', input.locationTag, 'location_tag');
  }

  // Caption conflicts: if caption has a clear correction, mark review
  let decisionStage: VisualEventCandidate['decisionStage'] = 'extracted';
  let rejectionReason: string | null = null;
  if (input.caption && /\b(?:cancel+ed|postponed|moved\s+to|correction|update)\b/i.test(input.caption)) {
    decisionStage = 'review';
    pushEvidence(evidence, 'captionCorrection', input.caption.slice(0, 200), 'caption');
  }

  if (loc.trust === 'out_of_market') {
    decisionStage = 'rejected';
    rejectionReason = 'out_of_market';
  }

  if (dateTrust.temporalClass === 'expired') {
    decisionStage = 'rejected';
    rejectionReason = 'expired';
  } else if (dateTrust.yearTrust === 'year_inferred_review' || dateTrust.temporalClass === 'review') {
    decisionStage = 'review';
  } else if (dateTrust.yearTrust === 'year_unresolved') {
    decisionStage = 'review';
  } else if (dateTrust.yearTrust === 'year_corroborated') {
    // Corroborated year is still review-grade for Calendar; extraction may proceed as current candidate
    decisionStage = 'extracted';
  }

  if (loc.trust === 'curator_only' || loc.trust === 'unknown') {
    if (decisionStage === 'extracted') decisionStage = 'review';
  }

  return {
    title: titleLine,
    eventDate: dateTrust.isoDate,
    eventTime: time,
    endTime,
    venue: loc.venue,
    address: loc.address,
    neighborhood: loc.neighborhood,
    city: loc.city,
    price,
    ageRestriction: age,
    ticketUrl: null,
    performers: [],
    dayHeading,
    originalQuotedText: input.text.slice(0, 400),
    slideNumbers: [input.slideNumber],
    permalink: input.permalink,
    yearTrust: dateTrust.yearTrust,
    yearInferenceExplanation: dateTrust.explanation,
    locationTrust: loc.trust,
    temporalClass: dateTrust.temporalClass,
    likelihoodScore: Math.min(1, 0.4 + input.confidence * 0.4),
    fieldEvidence: evidence,
    decisionStage,
    rejectionReason,
    duplicateOf: null,
  };
}

/**
 * Assemble events across caption + slides.
 * Multi-event carousels → one candidate per event-bearing slide (or row).
 * Multi-slide one event → combine with evidence when titles/venues align.
 */
export function assembleVisualEvents(input: {
  acquired: AcquiredInstagramMedia;
  slideOcr: SlideOcrEvidence[];
  captionEvents?: Array<{ name: string; quoted: string }>;
}): VisualEventCandidate[] {
  const { acquired, slideOcr } = input;
  const candidates: VisualEventCandidate[] = [];
  let dayHeading: string | null = null;

  // Caption-level ticket links only (never synthesize IG permalinks)
  const ticketFromCaption =
    acquired.caption?.match(/https?:\/\/[^\s]+/i)?.[0] &&
    /ticket|eventbrite|dice\.fm|posh\.vip|tix/i.test(acquired.caption)
      ? acquired.caption.match(/https?:\/\/\S+/i)?.[0] ?? null
      : null;

  for (const slide of slideOcr) {
    const text = slide.normalizedText || slide.rawText;
    if (!text.trim()) continue;

    const headingLine = parseLines(text).find((l) => DAY_HEADING.test(l) && l.length < 40);
    if (headingLine) dayHeading = headingLine;

    // Multi-event slide: split on day headings only when multiple day sections exist
    // (single flyer with "Friday, September 18" must stay one candidate).
    const lines = parseLines(text);
    const dayHeadingCount = lines.filter((l) => DAY_HEADING.test(l) && l.length < 40).length;
    const chunks: string[] = [];
    let buf: string[] = [];
    if (dayHeadingCount >= 2) {
      for (const line of lines) {
        if (DAY_HEADING.test(line) && line.length < 40 && buf.length > 0) {
          chunks.push(buf.join('\n'));
          buf = [line];
        } else {
          buf.push(line);
        }
      }
      if (buf.length) chunks.push(buf.join('\n'));
    } else {
      chunks.push(text);
    }

    const useChunks =
      chunks.length > 1 && chunks.filter((c) => TIME_RE.test(c) || c.length > 20).length > 1
        ? chunks
        : [text];

    for (const chunk of useChunks) {
      const c = candidateFromSlideText({
        slideNumber: slide.slideNumber,
        text: chunk,
        confidence: slide.confidence,
        permalink: acquired.permalink,
        caption: acquired.caption,
        locationTag: acquired.locationTag,
        handle: acquired.handle,
        publishedAt: acquired.publishedAt,
        dayHeading,
      });
      if (!c) continue;
      if (ticketFromCaption) {
        c.ticketUrl = ticketFromCaption;
        pushEvidence(c.fieldEvidence, 'ticketUrl', ticketFromCaption, 'ticket_link');
      }
      candidates.push(c);
    }
  }

  // Caption-only events when slides empty but caption has dated facts
  if (candidates.length === 0 && acquired.caption && acquired.caption.length > 20) {
    const c = candidateFromSlideText({
      slideNumber: 0,
      text: acquired.caption,
      confidence: 0.5,
      permalink: acquired.permalink,
      caption: acquired.caption,
      locationTag: acquired.locationTag,
      handle: acquired.handle,
      publishedAt: acquired.publishedAt,
      dayHeading: null,
    });
    if (c) {
      c.fieldEvidence = c.fieldEvidence.map((e) =>
        e.source === 'slide_ocr' ? { ...e, source: 'caption' as const } : e,
      );
      candidates.push(c);
    }
  }

  // Merge multi-slide same event (title+venue align) — preserve all slide evidence
  return mergeAlignedSlideCandidates(candidates);
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40);
}

function mergeAlignedSlideCandidates(items: VisualEventCandidate[]): VisualEventCandidate[] {
  const out: VisualEventCandidate[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.title &&
      item.title &&
      normalizeTitle(prev.title) === normalizeTitle(item.title) &&
      (prev.eventDate ?? '') === (item.eventDate ?? '') &&
      (!prev.venue || !item.venue || prev.venue.toLowerCase() === item.venue.toLowerCase())
    ) {
      prev.slideNumbers = [...new Set([...prev.slideNumbers, ...item.slideNumbers])].sort(
        (a, b) => a - b,
      );
      prev.fieldEvidence = [...prev.fieldEvidence, ...item.fieldEvidence];
      if (!prev.eventTime && item.eventTime) prev.eventTime = item.eventTime;
      if (!prev.venue && item.venue) prev.venue = item.venue;
      if (!prev.price && item.price) prev.price = item.price;
      continue;
    }
    out.push(item);
  }
  return out;
}

export function extractCaptionHashtags(caption: string | null): string[] {
  return caption ? extractHashtags(caption) : [];
}

export { isRoundupCoverTitle, ROUNDUP_TITLE };
