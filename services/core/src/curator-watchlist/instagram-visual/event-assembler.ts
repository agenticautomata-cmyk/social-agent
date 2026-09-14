/**
 * Evidence-aware multi-slide event assembly.
 * Do NOT: treat roundup title as sole event; cross-assign unrelated venues;
 * one vague event for whole roundup; fabricate slide URLs.
 * Caption + carousel = one evidence bundle; classify post type first.
 */

import { extractCaptionStructuredEvent } from './caption-event-extract.js';
import { resolveEventDateWithYearTrust } from './date-year-trust.js';
import { evaluateEventQualityGate } from './event-quality-gate.js';
import { isInstagramErrorChrome, isInstagramErrorChromeTitle } from './ig-error-chrome.js';
import { assessLocationTrust } from './location-trust.js';
import { assessOcrTitleQuality, isOcrGibberishTitle } from './ocr-quality.js';
import { classifyInstagramPostContent } from './post-classification.js';
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
  note?: string,
): void {
  if (!value?.trim()) return;
  list.push({
    field,
    value: value.trim(),
    source,
    slideNumber: slideNumber ?? null,
    confidence: confidence ?? null,
    note: note ?? null,
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
  rawOcr?: string;
  mediaHash?: string;
}): VisualEventCandidate | null {
  if (isInstagramErrorChrome(input.text) || isInstagramErrorChrome(input.caption)) {
    return null;
  }
  const lines = parseLines(input.text);
  if (lines.length === 0) return null;

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
    if (isOcrGibberishTitle(line, { ocrConfidence: input.confidence, caption: input.caption })) {
      continue;
    }
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
      !DAY_HEADING.test(line) &&
      !isOcrGibberishTitle(line, { ocrConfidence: input.confidence, caption: input.caption })
    ) {
      subtitle = line;
    }
  }
  if (!titleLine) return null;

  const titleQ = assessOcrTitleQuality(titleLine, {
    ocrConfidence: input.confidence,
    caption: input.caption,
  });
  if (!titleQ.usableAsTitle) {
    return null;
  }

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
  if (input.rawOcr) {
    pushEvidence(
      evidence,
      'rawOcr',
      input.rawOcr.slice(0, 500),
      'slide_ocr',
      input.slideNumber,
      input.confidence,
      'diagnostic_only',
    );
  }
  if (input.mediaHash) {
    pushEvidence(evidence, 'mediaHash', input.mediaHash, 'slide_ocr', input.slideNumber);
  }
  pushEvidence(
    evidence,
    'ocrQuality',
    titleQ.reasons.join(',') || String(titleQ.score),
    'slide_ocr',
    input.slideNumber,
    titleQ.score,
  );
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

function applyQualityGate(
  candidates: VisualEventCandidate[],
  caption: string | null,
  postClassIsEvent: boolean,
): VisualEventCandidate[] {
  const out: VisualEventCandidate[] = [];
  for (const c of candidates) {
    if (c.decisionStage === 'rejected' || c.decisionStage === 'duplicate') {
      out.push(c);
      continue;
    }
    const gate = evaluateEventQualityGate(c, { caption, postClassIsEvent });
    if (gate.queue === 'reject') {
      out.push({
        ...c,
        decisionStage: 'rejected',
        rejectionReason: gate.reasons.join(',') || 'quality_gate',
        fieldEvidence: [
          ...c.fieldEvidence,
          {
            field: 'qualityGate',
            value: gate.reasons.join(','),
            source: 'platform_metadata',
            note: 'rejected',
          },
        ],
      });
      continue;
    }
    if (gate.queue === 'low_confidence_discovery') {
      out.push({
        ...c,
        decisionStage: 'review',
        rejectionReason: null,
        fieldEvidence: [
          ...c.fieldEvidence,
          {
            field: 'discoveryQueue',
            value: 'low_confidence_discovery',
            source: 'platform_metadata',
            note: gate.reasons.join(','),
          },
        ],
      });
      continue;
    }
    // event_lead — keep extracted or review as already set
    if (gate.reasons.includes('pass_review_visible') && c.decisionStage === 'extracted') {
      out.push({ ...c, decisionStage: 'review' });
    } else {
      out.push(c);
    }
  }
  return out;
}

/**
 * Assemble events across caption + slides.
 * Classify post type first. Single-event → one candidate from caption+slides.
 * Multi-event only when evidence supports distinct titles/dates.
 */
export function assembleVisualEvents(input: {
  acquired: AcquiredInstagramMedia;
  slideOcr: SlideOcrEvidence[];
  captionEvents?: Array<{ name: string; quoted: string }>;
}): VisualEventCandidate[] {
  const { acquired, slideOcr } = input;
  const ocrTexts = slideOcr.map((s) => s.normalizedText || s.rawText);
  const classification = classifyInstagramPostContent({
    caption: acquired.caption,
    altTexts: acquired.altTexts,
    ocrTexts,
    hashtags: acquired.hashtags,
  });

  // Non-event / story / recap / chrome → no event candidates (diagnostic OCR retained on slides)
  if (!classification.isEventBearing) {
    return [];
  }

  const ticketFromCaption =
    acquired.caption?.match(/https?:\/\/[^\s]+/i)?.[0] &&
    /ticket|eventbrite|dice\.fm|posh\.vip|tix/i.test(acquired.caption)
      ? acquired.caption.match(/https?:\/\/\S+/i)?.[0] ?? null
      : null;

  // Single-event: caption structured extract is authoritative when present
  if (classification.contentClass === 'single_event' && acquired.caption) {
    const fromCaption = extractCaptionStructuredEvent({
      caption: acquired.caption,
      permalink: acquired.permalink,
      publishedAt: acquired.publishedAt,
      locationTag: acquired.locationTag,
      handle: acquired.handle,
    });
    if (fromCaption) {
      // Attach supporting slide OCR as evidence only (not separate events)
      for (const slide of slideOcr) {
        const text = slide.normalizedText || slide.rawText;
        if (!text.trim()) continue;
        pushEvidence(
          fromCaption.fieldEvidence,
          'supportingSlideOcr',
          text.slice(0, 300),
          'slide_ocr',
          slide.slideNumber,
          slide.confidence,
          isOcrGibberishTitle(text, { ocrConfidence: slide.confidence, caption: acquired.caption })
            ? 'gibberish_diagnostic'
            : 'supporting',
        );
        if (!fromCaption.slideNumbers.includes(slide.slideNumber)) {
          fromCaption.slideNumbers.push(slide.slideNumber);
        }
        // Recover venue/time/price from slides when caption lacks them
        if (!fromCaption.eventTime) {
          const t = text.match(TIME_RE)?.[1];
          if (t) {
            fromCaption.eventTime = t;
            pushEvidence(fromCaption.fieldEvidence, 'eventTime', t, 'slide_ocr', slide.slideNumber);
          }
        }
        if (!fromCaption.venue) {
          const loc = assessLocationTrust({
            flyerText: text,
            caption: acquired.caption,
            locationTag: acquired.locationTag,
            curatorHandle: acquired.handle,
          });
          if (loc.venue) {
            fromCaption.venue = loc.venue;
            fromCaption.locationTrust = loc.trust;
            pushEvidence(fromCaption.fieldEvidence, 'venue', loc.venue, 'slide_ocr', slide.slideNumber);
          }
        }
      }
      fromCaption.slideNumbers.sort((a, b) => a - b);
      if (ticketFromCaption) {
        fromCaption.ticketUrl = ticketFromCaption;
        pushEvidence(fromCaption.fieldEvidence, 'ticketUrl', ticketFromCaption, 'ticket_link');
      }
      return applyQualityGate([fromCaption], acquired.caption, true);
    }
  }

  // Multi-event roundup or fallback: per usable slide, not per gibberish fragment
  const candidates: VisualEventCandidate[] = [];
  let dayHeading: string | null = null;

  for (const slide of slideOcr) {
    const text = slide.normalizedText || slide.rawText;
    if (!text.trim()) continue;

    // Store gibberish as diagnostic-only — never a candidate
    if (isOcrGibberishTitle(text, { ocrConfidence: slide.confidence, caption: acquired.caption })) {
      continue;
    }

    const headingLine = parseLines(text).find((l) => DAY_HEADING.test(l) && l.length < 40);
    if (headingLine) dayHeading = headingLine;

    const lines = parseLines(text);
    const dayHeadingCount = lines.filter((l) => DAY_HEADING.test(l) && l.length < 40).length;
    const chunks: string[] = [];
    let buf: string[] = [];
    if (dayHeadingCount >= 2 && classification.contentClass === 'multi_event_roundup') {
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
        rawOcr: slide.rawText,
        mediaHash: slide.mediaHash,
      });
      if (!c) continue;
      if (ticketFromCaption) {
        c.ticketUrl = ticketFromCaption;
        pushEvidence(c.fieldEvidence, 'ticketUrl', ticketFromCaption, 'ticket_link');
      }
      candidates.push(c);
    }
  }

  // Caption recovery when slides empty or all gibberish
  if (candidates.length === 0 && acquired.caption && acquired.caption.length > 20) {
    const fromCaption = extractCaptionStructuredEvent({
      caption: acquired.caption,
      permalink: acquired.permalink,
      publishedAt: acquired.publishedAt,
      locationTag: acquired.locationTag,
      handle: acquired.handle,
    });
    if (fromCaption) {
      candidates.push(fromCaption);
    } else {
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
  }

  // Single-event posts: collapse multiple slide fragments into one
  let merged = mergeAlignedSlideCandidates(candidates);
  if (classification.contentClass === 'single_event' && merged.length > 1) {
    const best =
      merged.find((c) => c.decisionStage === 'extracted' || c.decisionStage === 'review') ??
      merged[0]!;
    for (const other of merged) {
      if (other === best) continue;
      best.slideNumbers = [...new Set([...best.slideNumbers, ...other.slideNumbers])].sort(
        (a, b) => a - b,
      );
      best.fieldEvidence = [...best.fieldEvidence, ...other.fieldEvidence];
      if (!best.eventTime && other.eventTime) best.eventTime = other.eventTime;
      if (!best.venue && other.venue) best.venue = other.venue;
      if (!best.price && other.price) best.price = other.price;
    }
    merged = [best];
  }

  return applyQualityGate(merged, acquired.caption, classification.isEventBearing);
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
