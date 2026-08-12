import { estimateTokensFromChars } from './token-metrics.js';

export type ContentReductionReport = {
  originalChars: number;
  reducedChars: number;
  estimatedOriginalTokens: number;
  estimatedReducedTokens: number;
  reductionPercent: number;
  hardLimitApplied: boolean;
  truncatedAtParagraph: number | null;
};

const FOOTER_PATTERNS = [
  /\bunsubscribe\b[\s\S]{0,400}$/i,
  /\bview (?:in )?browser\b[\s\S]{0,200}$/i,
  /\bprivacy policy\b[\s\S]{0,300}$/i,
  /\bterms (?:of service|and conditions)\b[\s\S]{0,300}$/i,
  /\bmanage (?:your )?preferences\b[\s\S]{0,200}$/i,
  /\b©\s*20\d{2}[\s\S]{0,200}$/i,
];

const NAV_LINE_PATTERNS = [
  /^(?:home|about|contact|shop|menu|blog|facebook|instagram|twitter|linkedin|youtube)\s*$/i,
  /^(?:follow us|connect with us|share this)\b/i,
];

const EVENT_SIGNAL =
  /\b(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}|(?:mon|tues|wednes|thurs|fri|sat|sun)[a-z]*day|\d{1,2}:\d{2}\s*(?:am|pm)?|kansas city|\bkc\b|venue|concert|festival|opening|tickets?|rsvp|free admission|free entry|happy hour|pop[- ]?up|market|fair|workshop|registration|location|address|@\s*\d{1,2}:\d{2})\b/i;

const PRODUCT_GRID_LINE =
  /^(?:\$?\d+(?:\.\d{2})?\s+)?(?:sale|now|shop|buy|add to cart|\d+% off)/i;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:nav|footer|header)[^>]*>[\s\S]*?<\/(?:nav|footer|header)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTrackingUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+(?:utm_[^\s&]+[^\s]*)/gi, '[link]')
    .replace(/https?:\/\/[^\s]{80,}/gi, '[long-link]');
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paragraphs) {
    const key = p.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function scoreParagraph(text: string): number {
  let score = 0;
  if (EVENT_SIGNAL.test(text)) score += 3;
  if (/\b(?:free|complimentary|no cover|no admission)\b/i.test(text)) score += 2;
  if (/\b(?:at|@)\s+[A-Z]/i.test(text)) score += 1;
  if (/\b\d{1,2}:\d{2}\b/.test(text)) score += 2;
  if (PRODUCT_GRID_LINE.test(text.trim())) score -= 3;
  if (/unsubscribe|privacy policy|view in browser/i.test(text)) score -= 5;
  if (text.length < 20) score -= 2;
  if (text.length > 600) score -= 1;
  return score;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|(?:\r\n){2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function applyHardLimit(paragraphs: string[], hardLimit: number): {
  text: string;
  hardLimitApplied: boolean;
  truncatedAtParagraph: number | null;
} {
  const kept: string[] = [];
  let len = 0;
  for (let i = 0; i < paragraphs.length; i += 1) {
    const next = paragraphs[i]!;
    const add = (kept.length ? 2 : 0) + next.length;
    if (len + add > hardLimit) break;
    kept.push(next);
    len += add;
  }
  if (kept.length === 0 && paragraphs.length > 0) {
    kept.push(paragraphs[0]!.slice(0, hardLimit));
  }
  return {
    text: kept.join('\n\n'),
    hardLimitApplied: kept.length < paragraphs.length,
    truncatedAtParagraph: kept.length < paragraphs.length ? kept.length : null,
  };
}

export function reduceNewsletterContent(input: {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  urls?: string[];
  hardLimitChars?: number;
}): { text: string; report: ContentReductionReport } {
  const hardLimit = input.hardLimitChars ?? Number(process.env.NEWSLETTER_MAX_INPUT_CHARS ?? 4500);
  const originalPlain = input.bodyText.trim() || stripHtml(input.bodyHtml);
  let working = originalPlain;

  for (const pattern of FOOTER_PATTERNS) {
    working = working.replace(pattern, ' ').trim();
  }

  working = normalizeTrackingUrls(working);
  working = working.replace(/\b(?:https?:\/\/[^\s]+)\b/gi, (url) =>
    url.length > 72 ? '[link]' : url,
  );

  const paragraphs = splitParagraphs(working)
    .filter((p) => !NAV_LINE_PATTERNS.some((re) => re.test(p.trim())))
    .filter((p) => !/^[\s\W]*$/.test(p));

  const scored = dedupeParagraphs(paragraphs)
    .map((p) => ({ p, score: scoreParagraph(p) }))
    .sort((a, b) => b.score - a.score);

  const eventParagraphs = scored.filter((s) => s.score > 0).map((s) => s.p);
  const neutralFallback = scored.filter((s) => s.score >= 0).slice(0, 6).map((s) => s.p);
  const selected = eventParagraphs.length >= 1 ? eventParagraphs : neutralFallback;

  const header = [`Subject: ${input.subject.trim()}`];
  if (input.urls?.length) {
    header.push(`Links: ${input.urls.slice(0, 8).join(' ')}`);
  }

  const limited = applyHardLimit(selected, Math.max(500, hardLimit - header.join('\n').length - 2));
  const reduced = [...header, limited.text].filter(Boolean).join('\n\n').trim();

  const originalChars = originalPlain.length;
  const reducedChars = reduced.length;
  const estimatedOriginalTokens = estimateTokensFromChars(originalPlain.length + input.subject.length, 600);
  const estimatedReducedTokens = estimateTokensFromChars(reducedChars, 500);

  return {
    text: reduced,
    report: {
      originalChars,
      reducedChars,
      estimatedOriginalTokens,
      estimatedReducedTokens,
      reductionPercent:
        originalChars > 0
          ? Math.round((1 - reducedChars / originalChars) * 1000) / 10
          : 0,
      hardLimitApplied: limited.hardLimitApplied,
      truncatedAtParagraph: limited.truncatedAtParagraph,
    },
  };
}
