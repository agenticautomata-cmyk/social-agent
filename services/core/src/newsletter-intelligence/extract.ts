import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { slugify } from '../ask-benson/listing-extract.js';
import { recoverDatesNearTitle } from './date-normalize.js';
import {
  extractDatedOccurrencesFromPlainText,
  mergeNewsletterOccurrenceItems,
  newsletterPlainText,
} from './dated-occurrence-extract.js';
import type { ExtractedNewsletterItem, EntityType, OccurrenceType } from './types.js';

const EXTRACT_CACHE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache/newsletter-extract',
);

function extractCacheKey(input: {
  gmailMessageId?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  senderName: string | null;
  senderEmail: string | null;
  newsletterSourceName: string | null;
  urls: string[];
}): string {
  if (input.gmailMessageId?.trim()) {
    return createHash('sha256').update(`gmail:${input.gmailMessageId.trim()}`).digest('hex').slice(0, 24);
  }
  const plain = input.bodyText.trim() || input.bodyHtml.slice(0, 14000);
  return createHash('sha256')
    .update(
      JSON.stringify({
        subject: input.subject,
        sender: input.senderName ?? input.senderEmail,
        source: input.newsletterSourceName,
        urls: input.urls.slice(0, 20),
        body: plain.slice(0, 12000),
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

const ItemSchema = z.object({
  entityName: z.string().min(1).optional(),
  entityType: z.string().optional(),
  occurrenceType: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  streetAddress: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  isFree: z.boolean().nullable().optional(),
  ageRestriction: z.string().nullable().optional(),
  rsvpRequired: z.boolean().nullable().optional(),
  reservationLink: z.string().nullable().optional(),
  ticketLink: z.string().nullable().optional(),
  officialWebsite: z.string().nullable().optional(),
  officialSocialLink: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  organizer: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  layer: z.string().optional(),
}).passthrough();

const ExtractionSchema = z.object({
  items: z.array(ItemSchema).max(50).default([]),
  needsOcr: z.boolean().optional(),
}).passthrough();

const ENTITY_TYPES = new Set<string>([
  'restaurant',
  'bar',
  'retailer',
  'store',
  'shopping_center',
  'event_venue',
  'attraction',
  'organizer',
  'festival',
  'market',
  'local_business',
]);

const OCCURRENCE_TYPES = new Set<string>([
  'opening',
  'closing',
  'grand_opening',
  'pop_up',
  'happy_hour',
  'tasting',
  'chef_dinner',
  'menu_launch',
  'sale',
  'clearance',
  'product_release',
  'workshop',
  'concert',
  'festival',
  'market',
  'appearance',
  'registration_deadline',
  'ticket_sale',
  'recurring_event',
  'general_event',
]);

function normalizeEntityType(raw: string | null | undefined): EntityType {
  if (!raw?.trim()) return 'local_business';
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  if (ENTITY_TYPES.has(key)) return key as EntityType;
  if (/restaurant|dining|cafe|coffee|bakery|bar|brewery/i.test(raw)) return 'restaurant';
  if (/retail|store|shop|boutique|mall/i.test(raw)) return 'retailer';
  if (/venue|theater|theatre|arena|stadium/i.test(raw)) return 'event_venue';
  if (/festival|fair/i.test(raw)) return 'festival';
  if (/market|farmers/i.test(raw)) return 'market';
  return 'local_business';
}

function normalizeOccurrenceType(raw: string | null | undefined): OccurrenceType | null {
  if (!raw?.trim()) return null;
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  if (OCCURRENCE_TYPES.has(key)) return key as OccurrenceType;
  if (/opening|now open|grand opening/i.test(raw)) return 'opening';
  if (/sale|discount|clearance|promo/i.test(raw)) return 'sale';
  if (/concert|show|performance/i.test(raw)) return 'concert';
  if (/festival/i.test(raw)) return 'festival';
  if (/ticket/i.test(raw)) return 'ticket_sale';
  return 'general_event';
}

function inferLayer(item: z.infer<typeof ItemSchema>): 'entity' | 'occurrence' {
  if (item.layer === 'entity' || item.layer === 'occurrence') return item.layer;
  if (item.startDate || item.startTime || item.occurrenceType) return 'occurrence';
  // LLM sometimes returns header/body/section — treat undated as entity
  return 'entity';
}

export function computeEmailContentFingerprint(input: {
  gmailMessageId: string;
  subject: string;
  senderEmail: string | null;
  bodyText: string;
}): string {
  const bodyHash = createHash('sha256').update(input.bodyText.slice(0, 12000)).digest('hex').slice(0, 16);
  const parts = [input.gmailMessageId, input.subject.trim().toLowerCase(), input.senderEmail ?? '', bodyHash];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function applyRecoveredOccurrenceDates(
  items: ExtractedNewsletterItem[],
  bodyText: string,
  emailSentAt?: Date | string | null,
): ExtractedNewsletterItem[] {
  return items.map((item) => {
    if (item.layer !== 'occurrence' && !item.occurrenceType && !item.startDate) {
      return item;
    }
    const recovered = recoverDatesNearTitle({
      title: item.title,
      description: item.description,
      bodyText,
      emailSentAt,
      rawStartDate: item.startDate,
      rawEndDate: item.endDate,
    });
    const startDate = recovered.startDate ?? item.startDate;
    const endDate = recovered.endDate ?? item.endDate;
    return {
      ...item,
      startDate,
      endDate,
      layer: startDate ? 'occurrence' : item.layer,
    };
  });
}

export async function extractNewsletterItems(input: {
  gmailMessageId?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  senderName: string | null;
  senderEmail: string | null;
  newsletterSourceName: string | null;
  urls: string[];
  emailSentAt?: Date | string | null;
}): Promise<{ items: ExtractedNewsletterItem[]; needsOcr: boolean }> {
  const plain = newsletterPlainText(input.bodyText, input.bodyHtml);
  const deterministic = extractDatedOccurrencesFromPlainText({
    subject: input.subject,
    bodyText: plain,
    emailSentAt: input.emailSentAt,
  });
  const cacheKey = extractCacheKey({ ...input, bodyText: plain });
  const cachePath = resolve(EXTRACT_CACHE_DIR, `${cacheKey}.json`);
  try {
    if (existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as {
        items: ExtractedNewsletterItem[];
        needsOcr: boolean;
      };
      return {
        ...cached,
        items: mergeNewsletterOccurrenceItems(
          applyRecoveredOccurrenceDates(
            cached.items,
            [input.subject, plain].filter(Boolean).join('\n'),
            input.emailSentAt,
          ),
          deterministic,
        ),
      };
    }
  } catch {
    // ignore cache read errors
  }

  if (!env.OPENAI_API_KEY?.trim()) {
    return { items: deterministic, needsOcr: false };
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    temperature: 0,
    seed: 42,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You extract structured Kansas City metro inventory from local newsletters.
Return JSON: { "items": [...], "needsOcr": boolean }.
Each item represents ONE distinct restaurant, retailer, venue, or dated event/occurrence.
Never return one vague item like "newsletter events".
Extract entity rows for places worth tracking even without a date.
Extract occurrence rows for dated events, sales, openings, concerts, deadlines.
Use America/Chicago context. Do not invent dates, times, addresses, or prices.
When the email states a date for an occurrence, set startDate to YYYY-MM-DD (and endDate when a window is stated).
Include fields entityName, entityType, title, layer (entity|occurrence), startDate, endDate, confidence.
Also accept name as alias for entityName/title when needed.
Do NOT invent dates, times, addresses, or prices that are not in the email.
Set needsOcr true when key event info appears only in images/flyers with no text.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          subject: input.subject,
          sender: input.senderName ?? input.senderEmail,
          newsletterSource: input.newsletterSourceName,
          urls: input.urls.slice(0, 20),
          bodyText: plain.slice(0, 12000),
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return { items: deterministic, needsOcr: false };

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { items: deterministic, needsOcr: false };
  }

  const parsed = ExtractionSchema.safeParse(raw);
  let rawItems: z.infer<typeof ItemSchema>[] = [];
  if (parsed.success) {
    rawItems = parsed.data.items;
  } else if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { items?: unknown }).items)) {
    for (const candidate of (raw as { items: unknown[] }).items) {
      const one = ItemSchema.safeParse(candidate);
      if (one.success) rawItems.push(one.data);
    }
  }

  const needsOcrFlag =
    (parsed.success && parsed.data.needsOcr === true) ||
    (typeof raw === 'object' && raw !== null && (raw as { needsOcr?: boolean }).needsOcr === true);

  const items: ExtractedNewsletterItem[] = rawItems
    .map((row) => {
      const anyRow = row as Record<string, unknown>;
      const entityName = String(
        row.entityName ?? anyRow.name ?? anyRow.entity ?? row.title ?? '',
      ).trim();
      const title = String(
        row.title ?? anyRow.name ?? anyRow.eventName ?? row.entityName ?? '',
      ).trim();
      if (!entityName || !title) return null;
      return {
        entityName,
        entityType: normalizeEntityType(String(row.entityType ?? anyRow.type ?? 'local_business')),
        occurrenceType: normalizeOccurrenceType(
          row.occurrenceType ?? (anyRow.eventType as string | undefined) ?? null,
        ),
        title,
        description: (row.description ?? (anyRow.summary as string | undefined))?.toString().trim() ?? null,
        startDate: row.startDate?.trim() ?? (anyRow.date as string | undefined)?.trim() ?? null,
        endDate: row.endDate?.trim() ?? null,
        startTime: row.startTime?.trim() ?? (anyRow.time as string | undefined)?.trim() ?? null,
        endTime: row.endTime?.trim() ?? null,
        timezone: row.timezone?.trim() ?? 'America/Chicago',
        venue: row.venue?.trim() ?? null,
        streetAddress: row.streetAddress?.trim() ?? (anyRow.address as string | undefined)?.trim() ?? null,
        city: row.city?.trim() ?? null,
        state: row.state?.trim() ?? null,
        zipCode: row.zipCode?.trim() ?? null,
        neighborhood: row.neighborhood?.trim() ?? null,
        price: row.price?.trim() ?? null,
        isFree: row.isFree ?? null,
        ageRestriction: row.ageRestriction?.trim() ?? null,
        rsvpRequired: row.rsvpRequired ?? null,
        reservationLink: row.reservationLink?.trim() ?? null,
        ticketLink: row.ticketLink?.trim() ?? null,
        officialWebsite: row.officialWebsite?.trim() ?? null,
        officialSocialLink: row.officialSocialLink?.trim() ?? null,
        phone: row.phone?.trim() ?? null,
        organizer: row.organizer?.trim() ?? null,
        sourceUrl: row.sourceUrl?.trim() ?? (anyRow.url as string | undefined)?.trim() ?? null,
        confidence: row.confidence ?? 0.55,
        layer: inferLayer(row),
      } satisfies ExtractedNewsletterItem;
    })
    .filter((row): row is ExtractedNewsletterItem => row != null);

  const datedItems = mergeNewsletterOccurrenceItems(
    applyRecoveredOccurrenceDates(
      items,
      [input.subject, plain].filter(Boolean).join('\n'),
      input.emailSentAt,
    ),
    deterministic,
  );
  const result = { items: datedItems, needsOcr: needsOcrFlag };
  try {
    mkdirSync(EXTRACT_CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ items, needsOcr: needsOcrFlag }));
  } catch {
    // cache is best-effort
  }
  return result;
}

export function entityExternalId(entityName: string, city: string | null): string {
  return `newsletter-entity-${slugify(entityName)}-${slugify(city ?? 'kc')}`;
}

export function occurrenceExternalId(fingerprint: string): string {
  return `newsletter-occurrence-${fingerprint}`;
}
