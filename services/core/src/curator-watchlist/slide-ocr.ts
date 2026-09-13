/**
 * Instagram carousel OCR — local tesseract first; billable vision OFF by default.
 */

import { createHash } from 'node:crypto';
import { env } from '../env.js';
import OpenAI from 'openai';
import { defaultInstagramVisualBounds } from './instagram-visual/bounds.js';
import { runLocalFlyerOcr } from './instagram-visual/local-ocr.js';

export type SlideOcrResult = {
  slideNumber: number;
  text: string;
  confidence: number;
  engine: string;
  contentHash: string;
  ok: boolean;
  error?: string;
  fromCache?: boolean;
};

/** Fetch IG CDN images with the authenticated Playwright session (raw URLs 403 for OpenAI). */
export type InstagramImageFetcher = (imageUrl: string) => Promise<string | null>;

export function createSessionImageFetcher(page: import('playwright').Page): InstagramImageFetcher {
  return async (imageUrl: string) => {
    try {
      const resp = await page.request.get(imageUrl);
      if (!resp.ok()) return null;
      const buf = await resp.body();
      if (buf.length < 32) return null;
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  };
}

const OCR_PROMPT = `Extract ALL visible text from this event roundup slide image.
Return plain text preserving:
- day headings (Friday, Saturday, Sunday, etc.)
- event names
- times
- venues and neighborhoods
- prices and age restrictions
- registration or ticket notes
Do NOT invent events. Do NOT copy marketing slogans as facts unless they name an event.
Return plain text only — no markdown.`;

async function dataUrlToBuffer(dataUrl: string): Promise<Buffer | null> {
  const m = /^data:[^;]+;base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return Buffer.from(m[1]!, 'base64');
}

async function fetchBuffer(
  imageUrl: string,
  fetchImage?: InstagramImageFetcher,
): Promise<Buffer | null> {
  if (fetchImage) {
    const dataUrl = await fetchImage(imageUrl);
    if (dataUrl) return dataUrlToBuffer(dataUrl);
  }
  if (imageUrl.startsWith('data:')) return dataUrlToBuffer(imageUrl);
  return null;
}

async function billableVisionOcr(input: {
  slideNumber: number;
  imageUrl: string;
  contentHash: string;
  captionContext?: string | null;
  fetchImage?: InstagramImageFetcher;
}): Promise<SlideOcrResult> {
  if (!env.OPENAI_API_KEY) {
    return {
      slideNumber: input.slideNumber,
      text: '',
      confidence: 0,
      engine: 'unconfigured',
      contentHash: input.contentHash,
      ok: false,
      error: 'OPENAI_API_KEY missing',
    };
  }

  try {
    let visionUrl = input.imageUrl;
    if (input.fetchImage) {
      const dataUrl = await input.fetchImage(input.imageUrl);
      if (dataUrl) visionUrl = dataUrl;
    }

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: input.captionContext
                ? `${OCR_PROMPT}\n\nPost caption context (for dates only, do not copy verbatim):\n${input.captionContext.slice(0, 400)}`
                : OCR_PROMPT,
            },
            { type: 'image_url', image_url: { url: visionUrl, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 1400,
      temperature: 0.1,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? '';
    return {
      slideNumber: input.slideNumber,
      text,
      confidence: text.length > 40 ? 0.82 : text.length > 10 ? 0.55 : 0.2,
      engine: 'openai-vision-gpt-4o-mini',
      contentHash: input.contentHash,
      ok: text.length > 8,
    };
  } catch (err) {
    return {
      slideNumber: input.slideNumber,
      text: '',
      confidence: 0,
      engine: 'openai-vision-gpt-4o-mini',
      contentHash: input.contentHash,
      ok: false,
      error: err instanceof Error ? err.message : 'ocr_failed',
    };
  }
}

export async function ocrCarouselSlide(input: {
  slideNumber: number;
  imageUrl: string;
  captionContext?: string | null;
  fetchImage?: InstagramImageFetcher;
}): Promise<SlideOcrResult> {
  const contentHash = createHash('sha256')
    .update(`${input.imageUrl}|${input.slideNumber}`)
    .digest('hex')
    .slice(0, 32);

  const bounds = defaultInstagramVisualBounds();
  const buf = await fetchBuffer(input.imageUrl, input.fetchImage);

  if (buf && buf.length >= 64) {
    const local = await runLocalFlyerOcr({
      buffer: buf,
      slideNumber: input.slideNumber,
      maxBytes: bounds.maxMediaBytes,
    });
    if (local.normalizedText.length >= 8) {
      return {
        slideNumber: input.slideNumber,
        text: local.normalizedText,
        confidence: local.confidence,
        engine: local.engine,
        contentHash: local.mediaHash,
        ok: true,
        fromCache: local.fromCache,
      };
    }

    // Escalate only when explicitly enabled
    if (bounds.enableBillableVision) {
      return billableVisionOcr({ ...input, contentHash });
    }

    return {
      slideNumber: input.slideNumber,
      text: local.normalizedText,
      confidence: local.confidence,
      engine: local.engine,
      contentHash: local.mediaHash,
      ok: local.normalizedText.length >= 8,
      error: local.normalizedText.length < 8 ? 'local_ocr_low_yield' : undefined,
      fromCache: local.fromCache,
    };
  }

  if (bounds.enableBillableVision) {
    return billableVisionOcr({ ...input, contentHash });
  }

  return {
    slideNumber: input.slideNumber,
    text: '',
    confidence: 0,
    engine: 'tesseract.js-local',
    contentHash,
    ok: false,
    error: 'image_bytes_unavailable_and_billable_vision_disabled',
  };
}

export async function ocrAllCarouselSlides(input: {
  slideImageUrls: string[];
  captionContext?: string | null;
  fetchImage?: InstagramImageFetcher;
}): Promise<SlideOcrResult[]> {
  const urls = input.slideImageUrls;
  if (urls.length === 0) return [];

  const concurrency = 2;
  const results: SlideOcrResult[] = [];

  for (let offset = 0; offset < urls.length; offset += concurrency) {
    const batch = urls.slice(offset, offset + concurrency);
    const batchResults = await Promise.all(
      batch.map((imageUrl, index) =>
        ocrCarouselSlide({
          slideNumber: offset + index + 1,
          imageUrl,
          captionContext: input.captionContext,
          fetchImage: input.fetchImage,
        }),
      ),
    );
    results.push(...batchResults);
  }

  return results;
}

/** Copyright safeguard — never embed curator graphics in generated summaries. */
export function buildAttributionLine(handle: string): string {
  const clean = handle.replace(/^@/, '');
  return `Discovered via @${clean}`;
}

export function sanitizeGeneratedSummary(summary: string, handle: string): string {
  const attribution = buildAttributionLine(handle);
  if (summary.includes(attribution)) return summary;
  return `${summary.trim()} (${attribution})`;
}
