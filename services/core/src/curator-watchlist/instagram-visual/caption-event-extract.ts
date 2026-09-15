/**
 * Caption-first structured event extraction for single-event posts.
 * Prefer caption identity over broken OCR slide fragments.
 */

import { resolveEventDateWithYearTrust } from './date-year-trust.js';
import { assessLocationTrust } from './location-trust.js';
import type { FieldEvidence, VisualEventCandidate } from './types.js';

const PRICE_RE = /\b(FREE|Free|free)\b|\$\s?\d+(?:\.\d{2})?/;

/**
 * Patterns like:
 * "Next up: FREE Sculpt Fusion in PNC Plaza on 9.16"
 * "Join us for Jazz Night at Mutual Musicians on Friday"
 */
const CAPTION_EVENT_PATTERNS: RegExp[] = [
  /\b(?:next\s+up|coming\s+up|join\s+us(?:\s+for)?|don'?t\s+miss)\s*:?\s*(?:(FREE|Free|free)\s+)?(.+?)\s+(?:in|at|@)\s+(.+?)\s+on\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?)/i,
  /\b(?:next\s+up|coming\s+up|join\s+us(?:\s+for)?)\s*:?\s*(?:(FREE|Free|free)\s+)?(.+?)\s+on\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|[A-Za-z]+\s+\d{1,2})/i,
];

/** Score caption/OCR lines as event titles — prefer series/edition/collab names over promo fragments. */
export function scoreEventTitleLine(
  line: string,
  opts?: { caption?: string | null; handle?: string | null },
): { score: number; reasons: string[] } {
  const t = line.replace(/\s+/g, ' ').trim();
  const reasons: string[] = [];
  if (!t || t.length < 3) return { score: 0, reasons: ['too_short'] };
  let score = 0.35;
  if (/\b(?:edition|series|presents|night|session|showcase|festival|concert|party|social)\b/i.test(t)) {
    score += 0.35;
    reasons.push('series_or_event_vocab');
  }
  if (/\b(?:r&b|hip-?hop|jazz|comedy|open\s*mic|dj\b|live\s+music)\b/i.test(t)) {
    score += 0.15;
    reasons.push('genre_vocab');
  }
  if (/^[A-Z0-9][\w'&]*(?:\s+[A-Z0-9][\w'&]*){1,6}$/.test(t) && t.length <= 60) {
    score += 0.1;
    reasons.push('title_case_compact');
  }
  // Promo / CTA fragments are weak titles.
  if (
    /\b(?:tickets?|link\s+in\s+bio|dm\s+us|tap\s+in|don'?t\s+miss|this\s+weekend|tonight|doors\s+at)\b/i.test(
      t,
    ) ||
    /https?:\/\//i.test(t) ||
    /^[@#]/.test(t)
  ) {
    score -= 0.4;
    reasons.push('promo_or_cta_fragment');
  }
  if (/\b\d{1,2}(?::\d{2})?\s*[ap]m\b/i.test(t) && t.length < 24) {
    score -= 0.35;
    reasons.push('time_fragment');
  }
  // Repeated across caption → stronger identity.
  if (opts?.caption && opts.caption.toLowerCase().split(t.toLowerCase()).length > 2) {
    score += 0.15;
    reasons.push('repeated_in_caption');
  }
  // Collab / hosted-by lines often include the real event name.
  if (/\b(?:with|x|×|feat\.?|featuring|hosted\s+by|presented\s+by)\b/i.test(t)) {
    score += 0.1;
    reasons.push('collab_line');
  }
  return { score: Math.max(0, Math.min(1, score)), reasons };
}

function preferCaptionEventTitle(caption: string): string | null {
  const lines = caption
    .split(/\n+|•|\u2022|\|/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && l.length <= 80);
  let best: { line: string; score: number } | null = null;
  for (const line of lines) {
    const { score } = scoreEventTitleLine(line, { caption });
    if (!best || score > best.score) best = { line, score };
  }
  return best && best.score >= 0.55 ? best.line : null;
}

function pushEvidence(
  list: FieldEvidence[],
  field: string,
  value: string | null | undefined,
  source: FieldEvidence['source'],
  confidence?: number,
): void {
  if (!value?.trim()) return;
  list.push({
    field,
    value: value.trim(),
    source,
    slideNumber: 0,
    confidence: confidence ?? 0.85,
  });
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\b(?:FREE|Free|free)\b/g, '')
    .replace(/^[:\-\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Extract a single structured event from a caption when patterns match.
 * Does not invent time/organizer/address/ticket.
 */
export function extractCaptionStructuredEvent(input: {
  caption: string;
  permalink: string;
  publishedAt: string | null;
  locationTag?: string | null;
  handle?: string;
  now?: Date;
}): VisualEventCandidate | null {
  const caption = input.caption.trim();
  if (caption.length < 12) return null;

  let title: string | null = null;
  let venueHint: string | null = null;
  let dateHint: string | null = null;
  let price: string | null = null;

  for (const re of CAPTION_EVENT_PATTERNS) {
    const m = caption.match(re);
    if (!m) continue;
    if (m.length >= 5) {
      // pattern with venue
      price = m[1] ? 'Free' : caption.match(PRICE_RE)?.[0] ?? null;
      if (price && /^free$/i.test(price)) price = 'Free';
      title = cleanTitle(m[2] ?? '');
      venueHint = (m[3] ?? '').replace(/[.,!]+$/, '').trim();
      dateHint = m[4] ?? null;
    } else if (m.length >= 4) {
      price = m[1] ? 'Free' : caption.match(PRICE_RE)?.[0] ?? null;
      if (price && /^free$/i.test(price)) price = 'Free';
      title = cleanTitle(m[2] ?? '');
      dateHint = m[3] ?? null;
    }
    if (title && title.length >= 3) break;
    title = null;
  }

  // Fallback: "FREE Title … on 9.16" without next-up prefix
  if (!title) {
    const loose = caption.match(
      /\b(?:FREE|Free)\s+([A-Z][\w'&.\s]{2,60}?)\s+(?:in|at)\s+([A-Z][\w'&.\s]{2,40}?)\s+on\s+(\d{1,2}[./]\d{1,2})/,
    );
    if (loose) {
      price = 'Free';
      title = cleanTitle(loose[1]!);
      venueHint = loose[2]!.trim();
      dateHint = loose[3]!;
    }
  }

  // Prefer explicit event-name lines (series / edition) over promo CTA fragments.
  if (!title) {
    const scored = preferCaptionEventTitle(caption);
    if (scored) title = cleanTitle(scored);
  }

  if (!title || title.length < 3) return null;

  const dateTrust = resolveEventDateWithYearTrust({
    text: `${dateHint ?? ''} ${caption}`,
    postPublishedAt: input.publishedAt,
    now: input.now,
  });

  const loc = assessLocationTrust({
    flyerText: venueHint,
    caption,
    locationTag: input.locationTag,
    curatorHandle: input.handle,
  });

  // Prefer explicit venue from caption pattern over heuristic
  const venue = venueHint || loc.venue;

  const evidence: FieldEvidence[] = [];
  pushEvidence(evidence, 'title', title, 'caption', 0.9);
  pushEvidence(evidence, 'eventDate', dateTrust.isoDate, 'caption');
  pushEvidence(evidence, 'yearTrust', dateTrust.yearTrust, 'caption');
  pushEvidence(evidence, 'yearInference', dateTrust.explanation, 'caption');
  pushEvidence(evidence, 'venue', venue, 'caption');
  pushEvidence(evidence, 'price', price, 'caption');
  pushEvidence(evidence, 'caption', caption.slice(0, 400), 'caption');

  let decisionStage: VisualEventCandidate['decisionStage'] = 'extracted';
  if (dateTrust.temporalClass === 'expired') {
    decisionStage = 'rejected';
  } else if (
    dateTrust.yearTrust === 'year_inferred_review' ||
    dateTrust.yearTrust === 'year_unresolved' ||
    dateTrust.temporalClass === 'review'
  ) {
    decisionStage = 'review';
  } else if (dateTrust.yearTrust === 'year_corroborated') {
    decisionStage = 'extracted';
  }

  if (!venue && decisionStage === 'extracted') decisionStage = 'review';

  return {
    title,
    eventDate: dateTrust.isoDate,
    eventTime: null, // never invent
    endTime: null,
    venue,
    address: loc.address,
    neighborhood: loc.neighborhood,
    city: loc.city,
    price,
    ageRestriction: null,
    ticketUrl: null,
    performers: [],
    dayHeading: null,
    originalQuotedText: caption.slice(0, 400),
    slideNumbers: [],
    permalink: input.permalink,
    yearTrust: dateTrust.yearTrust,
    yearInferenceExplanation: dateTrust.explanation,
    locationTrust: venue ? 'evidenced' : loc.trust,
    temporalClass: dateTrust.temporalClass,
    likelihoodScore: 0.85,
    fieldEvidence: evidence,
    decisionStage,
    rejectionReason: dateTrust.temporalClass === 'expired' ? 'expired' : null,
    duplicateOf: null,
  };
}
