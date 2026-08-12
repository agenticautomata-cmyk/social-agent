import { createHash } from 'node:crypto';
import { classifyImageSkipReason, ocrNewsletterImage } from './ocr.js';
import { isProviderQuotaError } from './provider-errors.js';
import { ocrTextHasEventSignals } from './token-metrics.js';
import { NEWSLETTER_OCR_VERSION } from './version.js';

export type SelectiveOcrStats = {
  emailsWithMedia: boolean;
  mediaInspected: number;
  /** Images sent through the OCR path (local or provider). */
  mediaOcrAttempted: number;
  localOcrRuns: number;
  localOcrCacheHits: number;
  localOcrFailures: number;
  providerOcrCalls: number;
  providerOcrInputTokens: number;
  providerOcrOutputTokens: number;
  providerBlocked: boolean;
  supplementalBlocks: string[];
};

const MAX_SELECTIVE_OCR = Number(process.env.NEWSLETTER_MAX_SELECTIVE_OCR ?? 2);

const LIKELY_FLYER =
  /flyer|poster|event|calendar|invite|schedule|lineup|map|venue|save-the-date/i;

function decodeDataUrlImage(src: string): { buffer: Buffer; mimeType: string } | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(src.trim());
  if (!m) return null;
  try {
    const buffer = Buffer.from(m[2]!, 'base64');
    if (buffer.length < 2000) return null;
    return { buffer, mimeType: m[1]! };
  } catch {
    return null;
  }
}

function extractCandidateImageUrls(bodyHtml: string, urls: string[]): string[] {
  const out: string[] = [];
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(bodyHtml)) !== null) {
    const src = match[1] ?? '';
    if (!src) continue;
    if (src.startsWith('data:')) {
      out.push(src);
      continue;
    }
    const alt = /alt=["']([^"']*)["']/i.exec(match[0])?.[1] ?? '';
    const filename = src.split('/').pop()?.split('?')[0] ?? '';
    const skip = classifyImageSkipReason({
      filename,
      altText: alt,
      byteLength: /pixel|1x1|spacer|track/i.test(src) ? 200 : 12000,
    });
    if (skip) continue;
    const blob = `${src} ${alt} ${filename}`;
    if (LIKELY_FLYER.test(blob) || src.length > 40) out.push(src);
  }
  for (const url of urls) {
    if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) out.push(url);
  }
  return [...new Set(out)].slice(0, 6);
}

function extractImageAltTextBlocks(bodyHtml: string): string[] {
  const out: string[] = [];
  const imgRe = /<img[^>]+>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(bodyHtml)) !== null) {
    const alt = /alt=["']([^"']*)["']/i.exec(match[0])?.[1]?.trim() ?? '';
    if (alt.length < 12) continue;
    const filename = /src=["']([^"']+)["']/i.exec(match[0])?.[1]?.split('/').pop()?.split('?')[0] ?? '';
    const skip = classifyImageSkipReason({
      filename,
      altText: alt,
      byteLength: 12000,
    });
    if (skip === 'logo' || skip === 'tracking_pixel' || skip === 'social_icon') continue;
    if (LIKELY_FLYER.test(`${alt} ${filename}`) || ocrTextHasEventSignals(alt)) {
      out.push(alt);
    }
  }
  return out;
}

function extractPdfHintBlocks(urls: string[], subject: string, bodyText: string): string[] {
  const out: string[] = [];
  for (const url of urls) {
    if (!/\.pdf(\?|$)/i.test(url)) continue;
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
    const blob = `${subject}\n${bodyText}\n${filename}`.slice(0, 2000);
    if (ocrTextHasEventSignals(blob) || LIKELY_FLYER.test(blob)) {
      out.push(`PDF flyer link: ${filename}\n${bodyText.slice(0, 800)}`.trim());
    }
  }
  return out;
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    if (!/^image\//i.test(mimeType)) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 2000) return null;
    return { buffer: buf, mimeType };
  } catch {
    return null;
  }
}

export async function runSelectiveNewsletterOcr(input: {
  gmailMessageId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  urls: string[];
  /** Skip alt-text / PDF hint blocks — binary media fixtures only. */
  mediaOnly?: boolean;
}): Promise<SelectiveOcrStats> {
  const stats: SelectiveOcrStats = {
    emailsWithMedia: false,
    mediaInspected: 0,
    mediaOcrAttempted: 0,
    localOcrRuns: 0,
    localOcrCacheHits: 0,
    localOcrFailures: 0,
    providerOcrCalls: 0,
    providerOcrInputTokens: 0,
    providerOcrOutputTokens: 0,
    providerBlocked: false,
    supplementalBlocks: [],
  };

  if (!input.mediaOnly) {
    for (const alt of extractImageAltTextBlocks(input.bodyHtml)) {
      stats.emailsWithMedia = true;
      stats.mediaInspected += 1;
      stats.supplementalBlocks.push(`[ALT ${NEWSLETTER_OCR_VERSION}]\n${alt.slice(0, 1200)}`);
    }

    for (const pdfBlock of extractPdfHintBlocks(input.urls, input.subject, input.bodyText)) {
      stats.emailsWithMedia = true;
      stats.supplementalBlocks.push(`[PDF ${NEWSLETTER_OCR_VERSION}]\n${pdfBlock.slice(0, 1200)}`);
    }
  }

  const candidates = extractCandidateImageUrls(input.bodyHtml, input.urls);
  if (candidates.length === 0 && stats.supplementalBlocks.length === 0) return stats;

  stats.emailsWithMedia = true;
  const seenHashes = new Set<string>();
  let budget = MAX_SELECTIVE_OCR;

  for (const url of candidates) {
    if (budget <= 0) break;
    stats.mediaInspected += 1;

    let fetched: { buffer: Buffer; mimeType: string } | null = null;
    if (url.startsWith('data:')) {
      fetched = decodeDataUrlImage(url);
    } else {
      fetched = await fetchImageBuffer(url);
    }
    if (!fetched) continue;

    const hash = createHash('sha256').update(fetched.buffer).digest('hex').slice(0, 16);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    stats.mediaOcrAttempted += 1;
    budget -= 1;

    const ocr = await ocrNewsletterImage({
      order: stats.mediaOcrAttempted,
      sourceType: 'linked_flyer',
      sourceRef: url,
      buffer: fetched.buffer,
      mimeType: fetched.mimeType,
      subjectContext: input.subject,
      gmailMessageId: input.gmailMessageId,
    });

    if (ocr.providerBlocked || (ocr.error && isProviderQuotaError(ocr.error))) {
      stats.providerBlocked = true;
      break;
    }

    if (ocr.fromCache) {
      stats.localOcrCacheHits += 1;
    } else if (ocr.engine === 'openai-vision-gpt-4o-mini') {
      if (ocr.ok) {
        stats.providerOcrCalls += 1;
        stats.providerOcrInputTokens += 1200;
        stats.providerOcrOutputTokens += 180;
      }
    } else if (ocr.engine === 'tesseract.js-local') {
      if (ocr.ok) stats.localOcrRuns += 1;
      else stats.localOcrFailures += 1;
    } else if (!ocr.ok) {
      stats.localOcrFailures += 1;
    }

    if (!ocr.ok) continue;

    const block = ocr.text.trim();
    if (block.length > 20 && ocrTextHasEventSignals(block)) {
      stats.supplementalBlocks.push(`[OCR ${NEWSLETTER_OCR_VERSION}]\n${block.slice(0, 1200)}`);
    }
  }

  return stats;
}
