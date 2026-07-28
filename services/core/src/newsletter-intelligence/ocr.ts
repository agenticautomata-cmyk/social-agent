import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';
import type { ExtractedNewsletterItem } from './types.js';

/** Disk cache so repeated dry-runs produce identical OCR-derived proposals. */
const OCR_CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.cache/newsletter-ocr');

function ocrCachePath(contentHash: string): string {
  return resolve(OCR_CACHE_DIR, `${contentHash}.json`);
}

function readOcrCache(contentHash: string): NewsletterOcrResult | null {
  try {
    const path = ocrCachePath(contentHash);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as NewsletterOcrResult;
  } catch {
    return null;
  }
}

function writeOcrCache(contentHash: string, result: NewsletterOcrResult): void {
  try {
    mkdirSync(OCR_CACHE_DIR, { recursive: true });
    writeFileSync(ocrCachePath(contentHash), JSON.stringify(result));
  } catch {
    // cache is best-effort
  }
}

export type NewsletterOcrResult = {
  order: number;
  sourceType: 'inline_image' | 'attachment' | 'linked_flyer' | 'pdf_page';
  sourceRef: string;
  text: string;
  confidence: number;
  engine: string;
  fields: Partial<ExtractedNewsletterItem>;
  ok: boolean;
  error?: string;
};

const FLYER_OCR_PROMPT = `Extract structured event/business information from this newsletter flyer image.
Return JSON only:
{
  "entityName": string,
  "title": string,
  "description": string|null,
  "startDate": "YYYY-MM-DD"|null,
  "endDate": "YYYY-MM-DD"|null,
  "startTime": "HH:MM"|null,
  "endTime": "HH:MM"|null,
  "dayOfWeek": string|null,
  "venue": string|null,
  "streetAddress": string|null,
  "city": string|null,
  "state": string|null,
  "zipCode": string|null,
  "price": string|null,
  "ageRestriction": string|null,
  "rsvpInstructions": string|null,
  "phone": string|null,
  "confidence": number
}
Do NOT invent missing fields. Use America/Chicago context for KC metro.
If the image is a logo, social icon, tracking pixel, or decorative graphic with no event info, return {"skip": true}.`;

const DECORATIVE_FILENAME =
  /(?:logo|pixel|spacer|icon|badge|social|facebook|instagram|twitter|linkedin|unsubscribe|header|footer|divider|arrow|button)/i;

export type ImageOutcomeKind =
  | 'tracking_pixel'
  | 'logo'
  | 'social_icon'
  | 'decorative'
  | 'duplicate'
  | 'too_small'
  | 'meaningful_image_with_text'
  | 'ocr_attempted'
  | 'ocr_succeeded'
  | 'ocr_failed'
  | 'deferred_resource_limit';

export type ImageAuditRecord = {
  sourceRef: string;
  senderDomain?: string;
  byteLength: number;
  filename?: string | null;
  mimeType?: string | null;
  outcome: ImageOutcomeKind;
  ocrAttempted: boolean;
  ocrSucceeded: boolean;
  reason?: string;
};

export function classifyImageSkipReason(input: {
  filename?: string | null;
  mimeType?: string | null;
  byteLength?: number;
  altText?: string | null;
}): ImageOutcomeKind | null {
  if (input.byteLength != null && input.byteLength < 1500) {
    return input.byteLength < 500 ? 'tracking_pixel' : 'too_small';
  }
  if (input.filename && /pixel|1x1|spacer|transparent/i.test(input.filename)) return 'tracking_pixel';
  if (input.filename && /logo/i.test(input.filename)) return 'logo';
  if (input.filename && /(?:facebook|instagram|twitter|linkedin|social|icon)/i.test(input.filename)) {
    return 'social_icon';
  }
  if (input.filename && DECORATIVE_FILENAME.test(input.filename)) return 'decorative';
  if (input.altText && /logo|icon|social|facebook|instagram|twitter/i.test(input.altText)) {
    return /logo/i.test(input.altText) ? 'logo' : 'social_icon';
  }
  if (input.mimeType && !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(input.mimeType)) return 'decorative';
  return null;
}

export function shouldSkipImageForOcr(input: {
  filename?: string | null;
  mimeType?: string | null;
  byteLength?: number;
  altText?: string | null;
}): boolean {
  return classifyImageSkipReason(input) != null;
}

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  const b64 = buffer.toString('base64');
  return `data:${mimeType};base64,${b64}`;
}

export async function ocrNewsletterImage(input: {
  order: number;
  sourceType: NewsletterOcrResult['sourceType'];
  sourceRef: string;
  buffer: Buffer;
  mimeType: string;
  subjectContext?: string | null;
  /** Stable cache identity: Gmail message id + content hash (never mutable tracking URLs). */
  gmailMessageId?: string | null;
}): Promise<NewsletterOcrResult> {
  const contentHash = createHash('sha256').update(input.buffer).digest('hex').slice(0, 16);
  const cacheIdentity = createHash('sha256')
    .update(`${input.gmailMessageId?.trim() || 'anon'}|${contentHash}|${input.sourceType}`)
    .digest('hex')
    .slice(0, 24);

  const cached = readOcrCache(cacheIdentity);
  if (cached) {
    return {
      ...cached,
      order: input.order,
      sourceType: input.sourceType,
      sourceRef: cached.sourceRef?.includes('#')
        ? cached.sourceRef
        : `${input.sourceRef}#${contentHash}`,
    };
  }

  if (!env.OPENAI_API_KEY) {
    return {
      order: input.order,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      text: '',
      confidence: 0,
      engine: 'unconfigured',
      fields: {},
      ok: false,
      error: 'OPENAI_API_KEY missing',
    };
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: input.subjectContext
                ? `${FLYER_OCR_PROMPT}\n\nEmail subject context: ${input.subjectContext.slice(0, 200)}`
                : FLYER_OCR_PROMPT,
            },
            {
              type: 'image_url',
              image_url: { url: bufferToDataUrl(input.buffer, input.mimeType), detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 1200,
      temperature: 0,
      seed: 42,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.skip === true) {
      const skipResult: NewsletterOcrResult = {
        order: input.order,
        sourceType: input.sourceType,
        sourceRef: `${input.sourceRef}#${contentHash}`,
        text: '',
        confidence: 0,
        engine: 'openai-vision-gpt-4o-mini',
        fields: {},
        ok: false,
        error: 'decorative_or_empty',
      };
      writeOcrCache(cacheIdentity, skipResult);
      return skipResult;
    }

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.65;
    const fields: Partial<ExtractedNewsletterItem> = {
      entityName: typeof parsed.entityName === 'string' ? parsed.entityName : undefined,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : null,
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : null,
      endDate: typeof parsed.endDate === 'string' ? parsed.endDate : null,
      startTime: typeof parsed.startTime === 'string' ? parsed.startTime : null,
      endTime: typeof parsed.endTime === 'string' ? parsed.endTime : null,
      venue: typeof parsed.venue === 'string' ? parsed.venue : null,
      streetAddress: typeof parsed.streetAddress === 'string' ? parsed.streetAddress : null,
      city: typeof parsed.city === 'string' ? parsed.city : null,
      state: typeof parsed.state === 'string' ? parsed.state : null,
      zipCode: typeof parsed.zipCode === 'string' ? parsed.zipCode : null,
      price: typeof parsed.price === 'string' ? parsed.price : null,
      ageRestriction: typeof parsed.ageRestriction === 'string' ? parsed.ageRestriction : null,
      phone: typeof parsed.phone === 'string' ? parsed.phone : null,
      confidence,
      layer: parsed.startDate ? 'occurrence' : 'entity',
    };

    const text = [
      fields.title,
      fields.entityName,
      fields.description,
      fields.venue,
      fields.streetAddress,
      fields.startDate,
      fields.startTime,
    ]
      .filter(Boolean)
      .join('\n');

    const result: NewsletterOcrResult = {
      order: input.order,
      sourceType: input.sourceType,
      sourceRef: `${input.sourceRef}#${contentHash}`,
      text,
      confidence,
      engine: 'openai-vision-gpt-4o-mini',
      fields,
      ok: text.length > 8,
    };
    writeOcrCache(cacheIdentity, result);
    return result;
  } catch (err) {
    const failResult: NewsletterOcrResult = {
      order: input.order,
      sourceType: input.sourceType,
      sourceRef: `${input.sourceRef}#${contentHash}`,
      text: '',
      confidence: 0,
      engine: 'openai-vision-gpt-4o-mini',
      fields: {},
      ok: false,
      error: err instanceof Error ? err.message : 'ocr_failed',
    };
    writeOcrCache(cacheIdentity, failResult);
    return failResult;
  }
}

export function ocrFieldsToNewsletterItem(
  fields: Partial<ExtractedNewsletterItem>,
  sourceRef: string,
): ExtractedNewsletterItem | null {
  if (!fields.entityName && !fields.title) return null;
  return {
    entityName: fields.entityName ?? fields.title ?? 'Unknown',
    entityType: 'local_business',
    occurrenceType: fields.startDate ? 'general_event' : null,
    title: fields.title ?? fields.entityName ?? 'Untitled',
    description: fields.description ?? null,
    startDate: fields.startDate ?? null,
    endDate: fields.endDate ?? null,
    startTime: fields.startTime ?? null,
    endTime: fields.endTime ?? null,
    timezone: 'America/Chicago',
    venue: fields.venue ?? null,
    streetAddress: fields.streetAddress ?? null,
    city: fields.city ?? null,
    state: fields.state ?? null,
    zipCode: fields.zipCode ?? null,
    neighborhood: null,
    price: fields.price ?? null,
    isFree: null,
    ageRestriction: fields.ageRestriction ?? null,
    rsvpRequired: Boolean(fields.description?.match(/rsvp|register|reservation required/i)),
    reservationLink: null,
    ticketLink: null,
    officialWebsite: null,
    officialSocialLink: null,
    phone: fields.phone ?? null,
    organizer: null,
    sourceUrl: sourceRef,
    confidence: fields.confidence ?? 0.6,
    layer: fields.startDate ? 'occurrence' : 'entity',
  };
}
