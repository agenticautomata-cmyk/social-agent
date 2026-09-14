/**
 * OCR gibberish / quality assessment for Instagram visual titles.
 * Raw OCR belongs in evidence/debug — never auto-promote to Event Lead title.
 */

export type OcrQualityAssessment = {
  usableAsTitle: boolean;
  score: number;
  reasons: string[];
  alphabeticWordRatio: number;
  shortFragmentRatio: number;
  symbolNoiseRatio: number;
};

const EVENT_VOCAB =
  /\b(?:event|show|concert|festival|party|market|workshop|class|performance|live|doors|tickets?|rsvp|free|join|tonight|tomorrow|weekend|friday|saturday|sunday|monday|tuesday|wednesday|thursday|am|pm|plaza|bridge|theater|theatre|hall|park|center|gallery|museum)\b/i;

/** Known garbage titles observed in production — reject as titles. */
const KNOWN_GARBAGE_TITLES = new Set(
  [
    'i zo sl de i)',
    'oy ihe po hy',
    'epa | te- 4 3',
    'fa 7s re nara 4',
  ].map((s) => normalizeForCompare(s)),
);

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s|)/.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens that look like real words (3+ letters, mostly vowels/consonants balanced). */
function looksLikeWord(tok: string): boolean {
  const t = tok.replace(/[^a-zA-Z']/g, '');
  if (t.length < 3) return false;
  if (/^[A-Z]{2,}$/.test(t) && t.length <= 4) return true; // acronyms OK
  const vowels = (t.match(/[aeiouy]/gi) ?? []).length;
  const letters = t.replace(/[^a-z]/gi, '').length;
  if (letters < 3) return false;
  // Extreme consonant dumps / random casing fragments
  if (vowels === 0 && letters >= 4) return false;
  return vowels / letters >= 0.15 && vowels / letters <= 0.75;
}

/**
 * Assess whether OCR text is usable as an event title.
 * Does not over-reject stylized names (e.g. "BizzyBody", "X Æ A-12"-lite short brands).
 */
export function assessOcrTitleQuality(
  text: string | null | undefined,
  opts?: { ocrConfidence?: number | null; caption?: string | null },
): OcrQualityAssessment {
  const raw = (text ?? '').trim();
  const reasons: string[] = [];
  if (!raw) {
    return {
      usableAsTitle: false,
      score: 0,
      reasons: ['empty'],
      alphabeticWordRatio: 0,
      shortFragmentRatio: 1,
      symbolNoiseRatio: 1,
    };
  }

  if (KNOWN_GARBAGE_TITLES.has(normalizeForCompare(raw))) {
    return {
      usableAsTitle: false,
      score: 0,
      reasons: ['known_garbage_title'],
      alphabeticWordRatio: 0,
      shortFragmentRatio: 1,
      symbolNoiseRatio: 1,
    };
  }

  const tokens = raw.split(/[\s|/·•]+/).filter(Boolean);
  const alphaTokens = tokens.filter((t) => /[a-zA-Z]/.test(t));
  const wordLike = alphaTokens.filter(looksLikeWord);
  const shortFrags = tokens.filter((t) => t.replace(/[^a-zA-Z0-9]/g, '').length <= 2);
  const symbolChars = (raw.match(/[^a-zA-Z0-9\s'&.:,\-]/g) ?? []).length;
  const alphabeticWordRatio = tokens.length ? wordLike.length / tokens.length : 0;
  const shortFragmentRatio = tokens.length ? shortFrags.length / tokens.length : 1;
  const symbolNoiseRatio = raw.length ? symbolChars / raw.length : 1;

  let score = 0.55;
  if (alphabeticWordRatio >= 0.5) score += 0.2;
  else if (alphabeticWordRatio < 0.25) {
    score -= 0.35;
    reasons.push('low_alphabetic_word_ratio');
  }
  if (shortFragmentRatio > 0.55 && tokens.length >= 3) {
    score -= 0.3;
    reasons.push('excessive_short_fragments');
  }
  if (symbolNoiseRatio > 0.18) {
    score -= 0.25;
    reasons.push('symbol_noise');
  }
  if ((opts?.ocrConfidence ?? 1) < 0.45) {
    score -= 0.15;
    reasons.push('low_ocr_confidence');
  }

  // Alternating capitalization noise: "I Zo SL dE"
  const alternating =
    tokens.length >= 3 &&
    tokens.filter((t) => /^[A-Za-z]$/.test(t) || /^[A-Z][a-z]$/.test(t) || /^[a-z]{1,2}$/.test(t))
      .length /
      tokens.length >
      0.6;
  if (alternating) {
    score -= 0.25;
    reasons.push('alternating_caps_noise');
  }

  // Broken spacing / single-letter soup
  const singleLetters = tokens.filter((t) => /^[A-Za-z]$/.test(t)).length;
  if (singleLetters >= 3 && singleLetters / tokens.length >= 0.4) {
    score -= 0.3;
    reasons.push('single_letter_soup');
  }

  // Caption agreement rescues weak OCR when caption contains the cleaned title
  const caption = (opts?.caption ?? '').toLowerCase();
  if (caption && wordLike.length >= 1) {
    const joined = wordLike.map((w) => w.toLowerCase()).join(' ');
    if (joined.length >= 4 && caption.includes(joined)) {
      score += 0.25;
      reasons.push('caption_agreement');
    }
  }

  if (EVENT_VOCAB.test(raw)) {
    score += 0.08;
    reasons.push('event_vocab');
  }

  // Stylized but legitimate: 1–3 tokens, mostly letters, length 4–40, few symbols
  const compact = raw.replace(/\s+/g, '');
  const stylizedOk =
    tokens.length <= 4 &&
    compact.length >= 4 &&
    compact.length <= 40 &&
    symbolNoiseRatio < 0.12 &&
    /[a-zA-Z]{3,}/.test(raw) &&
    alphabeticWordRatio >= 0.4;
  if (stylizedOk && score < 0.5) {
    score = Math.max(score, 0.55);
    reasons.push('stylized_name_preserved');
  }

  score = Math.max(0, Math.min(1, score));
  const usableAsTitle = score >= 0.5 && !reasons.includes('known_garbage_title');

  if (!usableAsTitle && reasons.length === 0) reasons.push('below_title_quality_threshold');

  return {
    usableAsTitle,
    score,
    reasons,
    alphabeticWordRatio,
    shortFragmentRatio,
    symbolNoiseRatio,
  };
}

export function isOcrGibberishTitle(
  text: string | null | undefined,
  opts?: { ocrConfidence?: number | null; caption?: string | null },
): boolean {
  return !assessOcrTitleQuality(text, opts).usableAsTitle;
}

export function isKnownGarbageTitle(text: string | null | undefined): boolean {
  return KNOWN_GARBAGE_TITLES.has(normalizeForCompare(text ?? ''));
}
