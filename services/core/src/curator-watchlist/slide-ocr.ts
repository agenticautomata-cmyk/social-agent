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
            { type: 'image_url', image_url: { url: input.imageUrl, detail: 'high' } },
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
}): Promise<SlideOcrResult[]> {
  const results: SlideOcrResult[] = [];
  for (let i = 0; i < input.slideImageUrls.length; i++) {
    const slideNumber = i + 1;
    const result = await ocrCarouselSlide({
      slideNumber,
      imageUrl: input.slideImageUrls[i]!,
      captionContext: input.captionContext,
    });
    results.push(result);
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
