import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { estimateMiniCost, recordLlmUsage } from '../llm-spend/index.js';
import { reduceNewsletterContent } from './content-reducer.js';
import {
  newsletterExtractMaxOutputTokens,
  selectNewsletterExtractionModel,
} from './model-routing.js';
import type { ExtractedNewsletterItem, EntityType, OccurrenceType } from './types.js';
import { isProviderQuotaError } from './provider-errors.js';
import {
  normalizeExtractedEventDate,
  type DateNormalizationStatus,
} from './date-normalize.js';
import { ocrTextHasEventSignals } from './token-metrics.js';
import {
  recordProviderAttempt,
  type ProviderAttemptTerminalStatus,
} from './provider-attempts.js';
import { NEWSLETTER_EXTRACTOR_VERSION, newsletterModelVersion } from './version.js';

export type CompactExtractStatus =
  | 'cache_hit'
  | 'llm_extracted'
  | 'provider_blocked'
  | 'extraction_failed';

const EXTRACT_CACHE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache/newsletter-extract-compact',
);

const CompactItemSchema = z.object({
  title: z.string().min(1),
  date: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  allDay: z.boolean().nullable().optional(),
  venue: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  isFree: z.boolean().nullable().optional(),
  freeTerms: z.string().nullable().optional(),
  tiktokSignals: z.array(z.string()).max(6).optional(),
  confidence: z.number().min(0).max(1).optional(),
  missingField: z.string().nullable().optional(),
});

const CompactExtractionSchema = z.object({
  items: z.array(CompactItemSchema).max(20).default([]),
});

export type CompactExtractUsage = {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  retryTokens: number;
  cacheHit: boolean;
  model: string;
  modelReason: string;
  contentReduction: ReturnType<typeof reduceNewsletterContent>['report'];
  requestIdLineage: string;
  providerCallsAttempted: number;
  providerCallsCompleted: number;
  status: CompactExtractStatus;
  dateRejections?: number;
};

function cacheKey(input: {
  gmailMessageId: string;
  contentHash: string;
  model: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.gmailMessageId}|${input.contentHash}|${NEWSLETTER_EXTRACTOR_VERSION}|${newsletterModelVersion(input.model)}`,
    )
    .digest('hex')
    .slice(0, 32);
}

function inferEntityType(title: string, venue: string | null): EntityType {
  const blob = `${title} ${venue ?? ''}`;
  if (/restaurant|dining|brunch|chef|food|cafe|bar|brewery/i.test(blob)) return 'restaurant';
  if (/festival|fair/i.test(blob)) return 'festival';
  if (/market|farmers/i.test(blob)) return 'market';
  if (/concert|theater|theatre|venue|show/i.test(blob)) return 'event_venue';
  if (/store|retail|shop|sale/i.test(blob)) return 'retailer';
  return 'local_business';
}

/** @deprecated unsafe roll-forward removed — see date-normalize.ts */
export { normalizeExtractedEventDate } from './date-normalize.js';

function inferOccurrenceType(title: string, freeTerms: string | null): OccurrenceType | null {
  const blob = `${title} ${freeTerms ?? ''}`;
  if (/opening|now open|grand opening/i.test(blob)) return 'opening';
  if (/concert|live music|performance/i.test(blob)) return 'concert';
  if (/festival/i.test(blob)) return 'festival';
  if (/market/i.test(blob)) return 'market';
  if (/free/i.test(blob)) return 'general_event';
  if (/sale|clearance|\d+% off/i.test(blob)) return 'sale';
  return 'general_event';
}

export function compactItemsToExtracted(
  items: z.infer<typeof CompactItemSchema>[],
  urls: string[],
  options?: {
    emailSentAt?: Date | string | null;
    sourceText?: string | null;
    hasRecurrenceProof?: boolean;
  },
): { items: ExtractedNewsletterItem[]; dateRejections: number } {
  let dateRejections = 0;
  const mapped = items.flatMap((row) => {
    const venue = row.venue?.trim() ?? null;
    const title = row.title.trim();
    const entityName = venue || title.split(/[-–|:]/)[0]?.trim() || title;
    const normalized = normalizeExtractedEventDate({
      rawDate: row.date,
      emailSentAt: options?.emailSentAt,
      sourceText: [options?.sourceText, title, row.freeTerms ?? ''].filter(Boolean).join('\n'),
      hasRecurrenceProof: options?.hasRecurrenceProof,
      hasStrongCurrentEventEvidence: /\b(?:just announced|this week|tickets on sale|doors \d)/i.test(
        `${title} ${row.freeTerms ?? ''}`,
      ),
    });
    if (normalized.status === 'rejected_stale_date') {
      dateRejections += 1;
      return [];
    }
    const startDate = normalized.isoDate;
    const hasDate = Boolean(startDate);
    return [
      {
        entityName,
        entityType: inferEntityType(title, venue),
        occurrenceType: inferOccurrenceType(title, row.freeTerms ?? null),
        title,
        description: row.freeTerms?.trim() ?? null,
        startDate,
        endDate: null,
        startTime: row.time?.trim() ?? null,
        endTime: null,
        timezone: 'America/Chicago',
        venue,
        streetAddress: null,
        city: row.city?.trim() ?? null,
        state: null,
        zipCode: null,
        neighborhood: null,
        price: row.isFree ? 'free' : null,
        isFree: row.isFree ?? null,
        ageRestriction: null,
        rsvpRequired: null,
        reservationLink: null,
        ticketLink: null,
        officialWebsite: null,
        officialSocialLink: null,
        phone: null,
        organizer: null,
        sourceUrl: row.sourceUrl?.trim() ?? urls[0] ?? null,
        confidence:
          normalized.status === 'needs_verification'
            ? Math.min(row.confidence ?? 0.6, 0.55)
            : (row.confidence ?? 0.6),
        layer: hasDate ? ('occurrence' as const) : ('entity' as const),
      },
    ];
  });
  return { items: mapped, dateRejections };
}

export function shouldRunCompactExtractRetry(input: {
  parseOk: boolean;
  itemCount: number;
  hasEventSignals: boolean;
  retryAlreadyUsed: boolean;
  quotaBlocked: boolean;
}): boolean {
  if (input.retryAlreadyUsed || input.quotaBlocked) return false;
  if (!input.hasEventSignals) return false;
  if (!input.parseOk) return true;
  return input.itemCount === 0;
}

async function callCompactExtract(input: {
  reducedText: string;
  subject: string;
  sender: string | null;
  model: string;
  requestIdLineage: string;
  gmailMessageId: string;
  stage: 'compact_extract' | 'compact_extract_retry';
  willRetryOnMalformed?: boolean;
}): Promise<{
  raw: unknown;
  usage: { prompt: number; completion: number };
  quotaBlocked?: boolean;
  terminalStatus: ProviderAttemptTerminalStatus;
}> {
  if (!env.OPENAI_API_KEY?.trim()) {
    recordProviderAttempt({
      requestLineageId: input.requestIdLineage,
      gmailMessageId: input.gmailMessageId,
      stage: input.stage,
      model: input.model,
      inputTokens: 0,
      outputTokens: 0,
      terminalStatus: 'fixture_only',
      detail: 'OPENAI_API_KEY missing',
    });
    return { raw: { items: [] }, usage: { prompt: 0, completion: 0 }, terminalStatus: 'fixture_only' };
  }

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: 0,
  });

  try {
    const response = await client.chat.completions.create({
      model: input.model,
      temperature: 0,
      seed: 42,
      max_tokens: newsletterExtractMaxOutputTokens(),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extract Kansas City metro events and literal free deals from newsletter text.
Return JSON only: {"items":[...]}.
Each item fields: title, date (YYYY-MM-DD|null), time (HH:MM|null), allDay, venue, city, sourceUrl, isFree, freeTerms, tiktokSignals[], confidence, missingField.
Include complete local events, literal free deals, TikTok-worthy happenings, and promising records missing exactly one field.
Skip product catalogs, percent-off promos, and national retail without KC proof.
Use YYYY-MM-DD. When year is omitted, infer relative to the email sent date — never rewrite an explicit past year forward.
No chain-of-thought. No summaries. No rejected-item explanations.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            requestId: input.requestIdLineage,
            subject: input.subject,
            sender: input.sender,
            body: input.reducedText,
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    let raw: unknown = { items: [] };
    if (content) {
      try {
        raw = JSON.parse(content);
      } catch {
        raw = { items: [] };
      }
    }

    const prompt = response.usage?.prompt_tokens ?? 0;
    const completion = response.usage?.completion_tokens ?? 0;
    let terminalStatus: ProviderAttemptTerminalStatus = 'completed_success';
    if (!content) {
      terminalStatus = 'completed_empty_valid';
    } else {
      try {
        JSON.parse(content);
      } catch {
        terminalStatus = input.willRetryOnMalformed ? 'controlled_retry' : 'malformed_response';
      }
    }
    recordProviderAttempt({
      requestLineageId: input.requestIdLineage,
      gmailMessageId: input.gmailMessageId,
      stage: input.stage,
      model: input.model,
      inputTokens: prompt,
      outputTokens: completion,
      terminalStatus,
    });

    return {
      raw,
      usage: { prompt, completion },
      terminalStatus,
    };
  } catch (err) {
    if (isProviderQuotaError(err)) {
      recordProviderAttempt({
        requestLineageId: input.requestIdLineage,
        gmailMessageId: input.gmailMessageId,
        stage: input.stage,
        model: input.model,
        inputTokens: 0,
        outputTokens: 0,
        terminalStatus: 'quota_blocked',
      });
      return {
        raw: null,
        usage: { prompt: 0, completion: 0 },
        quotaBlocked: true,
        terminalStatus: 'quota_blocked',
      };
    }
    const message = err instanceof Error ? err.message : 'transient_failure';
    const terminalStatus: ProviderAttemptTerminalStatus =
      /timeout|timed out/i.test(message) ? 'timeout' : 'transient_failure';
    recordProviderAttempt({
      requestLineageId: input.requestIdLineage,
      gmailMessageId: input.gmailMessageId,
      stage: input.stage,
      model: input.model,
      inputTokens: 0,
      outputTokens: 0,
      terminalStatus,
      detail: message,
    });
    throw err;
  }
}

function cacheIsStale(items: ExtractedNewsletterItem[]): boolean {
  if (items.length === 0) return true;
  const now = Date.now();
  return items.every((item) => {
    if (!item.startDate) return false;
    const parsed = Date.parse(item.startDate);
    if (Number.isNaN(parsed)) return false;
    return now - parsed > 14 * 86400000;
  });
}

export async function extractCompactNewsletterItems(input: {
  gmailMessageId: string;
  contentHash: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  senderEmail: string | null;
  senderName: string | null;
  urls: string[];
  supplementalOcrText?: string;
  recordSpend?: boolean;
  skipCache?: boolean;
  emailSentAt?: Date | string | null;
}): Promise<{
  items: ExtractedNewsletterItem[];
  usage: CompactExtractUsage;
}> {
  const { text: reducedText, report: contentReduction } = reduceNewsletterContent({
    subject: input.subject,
    bodyText: [input.bodyText, input.supplementalOcrText ?? ''].filter(Boolean).join('\n\n'),
    bodyHtml: input.bodyHtml,
    urls: input.urls,
  });

  const modelPick = selectNewsletterExtractionModel({
    reducedChars: reducedText.length,
    ambiguous: reducedText.length > 7000,
  });

  const key = cacheKey({
    gmailMessageId: input.gmailMessageId,
    contentHash: input.contentHash,
    model: modelPick.model,
  });
  const cachePath = resolve(EXTRACT_CACHE_DIR, `${key}.json`);

  try {
    if (!input.skipCache && existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as {
        items: ExtractedNewsletterItem[];
      };
      if (!cacheIsStale(cached.items ?? [])) {
        return {
          items: cached.items ?? [],
          usage: {
            llmCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            retryTokens: 0,
            cacheHit: true,
            model: modelPick.model,
            modelReason: modelPick.reason,
            contentReduction,
            requestIdLineage: key,
            providerCallsAttempted: 0,
            providerCallsCompleted: 0,
            status: 'cache_hit',
          },
        };
      }
    }
  } catch {
    // ignore cache read
  }

  const anchorLine = input.emailSentAt
    ? `Email sent: ${new Date(input.emailSentAt).toISOString().slice(0, 10)}\n`
    : '';
  const reducedPayload = anchorLine + reducedText;
  const requestIdLineage = key;
  let llmCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let retryTokens = 0;

  let providerCallsAttempted = 0;
  let providerCallsCompleted = 0;

  let result = await callCompactExtract({
    reducedText: reducedPayload,
    subject: input.subject,
    sender: input.senderName ?? input.senderEmail,
    model: modelPick.model,
    requestIdLineage,
    gmailMessageId: input.gmailMessageId,
    stage: 'compact_extract',
    willRetryOnMalformed: true,
  });
  providerCallsAttempted += 1;

  if (result.quotaBlocked) {
    return {
      items: [],
      usage: {
        llmCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        retryTokens: 0,
        cacheHit: false,
        model: modelPick.model,
        modelReason: modelPick.reason,
        contentReduction,
        requestIdLineage,
        providerCallsAttempted,
        providerCallsCompleted: 0,
        status: 'provider_blocked',
        dateRejections: 0,
      },
    };
  }

  llmCalls += 1;
  providerCallsCompleted += 1;
  inputTokens += result.usage.prompt;
  outputTokens += result.usage.completion;

  let parsed = CompactExtractionSchema.safeParse(result.raw);
  let compactExtractRetryUsed = false;

  if (
    shouldRunCompactExtractRetry({
      parseOk: parsed.success,
      itemCount: parsed.success ? parsed.data.items.length : 0,
      hasEventSignals: ocrTextHasEventSignals(reducedPayload),
      retryAlreadyUsed: compactExtractRetryUsed,
      quotaBlocked: false,
    })
  ) {
    compactExtractRetryUsed = true;
    const retry = await callCompactExtract({
      reducedText: reducedPayload,
      subject: input.subject,
      sender: input.senderName ?? input.senderEmail,
      model: modelPick.model,
      requestIdLineage: `${requestIdLineage}:retry1`,
      gmailMessageId: input.gmailMessageId,
      stage: 'compact_extract_retry',
    });
    providerCallsAttempted += 1;
    if (retry.quotaBlocked) {
      return {
        items: [],
        usage: {
          llmCalls,
          inputTokens,
          outputTokens,
          retryTokens,
          cacheHit: false,
          model: modelPick.model,
          modelReason: modelPick.reason,
          contentReduction,
          requestIdLineage,
          providerCallsAttempted,
          providerCallsCompleted,
          status: 'provider_blocked',
          dateRejections: 0,
        },
      };
    }
    llmCalls += 1;
    providerCallsCompleted += 1;
    retryTokens += retry.usage.prompt + retry.usage.completion;
    inputTokens += retry.usage.prompt;
    outputTokens += retry.usage.completion;
    const reparsed = CompactExtractionSchema.safeParse(retry.raw);
    if (reparsed.success) {
      parsed = reparsed;
    }
  }

  const extracted = compactItemsToExtracted(parsed.success ? parsed.data.items : [], input.urls, {
    emailSentAt: input.emailSentAt,
    sourceText: reducedText,
  });
  const items = extracted.items;
  const status: CompactExtractStatus = parsed.success ? 'llm_extracted' : 'extraction_failed';

  if (status === 'llm_extracted' && input.recordSpend !== false && (inputTokens > 0 || outputTokens > 0)) {
    await recordLlmUsage({
      source: 'newsletter_extract',
      model: modelPick.model,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      estimatedCost: estimateMiniCost(inputTokens, outputTokens),
      metadata: {
        gmailMessageId: input.gmailMessageId,
        cacheHit: false,
        extractorVersion: NEWSLETTER_EXTRACTOR_VERSION,
        requestIdLineage,
      },
    });
  }

  if (status === 'llm_extracted' && items.length > 0) {
    try {
      mkdirSync(EXTRACT_CACHE_DIR, { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ items, cachedAt: new Date().toISOString() }));
    } catch {
      // best-effort
    }
  }

  return {
    items,
    usage: {
      llmCalls,
      inputTokens,
      outputTokens,
      retryTokens,
      cacheHit: false,
      model: modelPick.model,
      modelReason: modelPick.reason,
      contentReduction,
      requestIdLineage,
      providerCallsAttempted,
      providerCallsCompleted,
      status,
      dateRejections: extracted.dateRejections,
    },
  };
}
