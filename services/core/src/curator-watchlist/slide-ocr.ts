import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { env } from '../env.js';

export type SlideOcrResult = {
  slideNumber: number;
  text: string;
  confidence: number;
  engine: string;
  contentHash: string;
  ok: boolean;
  error?: string;
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

  if (!env.OPENAI_API_KEY) {
    return {
      slideNumber: input.slideNumber,
      text: '',
      confidence: 0,
      engine: 'unconfigured',
      contentHash,
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
      contentHash,
      ok: text.length > 8,
    };
  } catch (err) {
    return {
      slideNumber: input.slideNumber,
      text: '',
      confidence: 0,
      engine: 'openai-vision-gpt-4o-mini',
      contentHash,
      ok: false,
      error: err instanceof Error ? err.message : 'ocr_failed',
    };
  }
}

export async function ocrAllCarouselSlides(input: {
  slideImageUrls: string[];
  captionContext?: string | null;
  fetchImage?: InstagramImageFetcher;
}): Promise<SlideOcrResult[]> {
  const urls = input.slideImageUrls;
  if (urls.length === 0) return [];

  const concurrency = 3;
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

export function sanitizeGeneratedSummary(text: string, handle: string): string {
  const attribution = buildAttributionLine(handle);
  let out = text.trim();
  if (!out.includes(attribution)) {
    out = `${out}\n\n${attribution}`;
  }
  // Never claim original reporting
  out = out.replace(/Benson(?:'s)? original reporting/gi, attribution);
  return out;
}
