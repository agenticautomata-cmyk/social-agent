import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { localWallTimeToUtc } from '../datetime.js';
import { isDirectoryListingContent, isDirectoryListingIntake } from './intake-intents.js';
import {
  extractEditorialContainerOpportunities,
  finalizeContainerOpportunities,
  prepareContainerExtraction,
} from './container-event-blocks.js';

const MODEL = 'gpt-4o-mini';

const ExtractedOpportunitySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  venue: z.string().optional().nullable(),
  businessName: z.string().optional().nullable(),
  eventDate: z.string().optional().nullable(),
  eventEndDate: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  parentArticleUrl: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  publisher: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
});

const ExtractionSchema = z.object({
  documentTitle: z.string().optional().nullable(),
  opportunities: z.array(ExtractedOpportunitySchema).max(40),
});

export type ExtractedOpportunity = z.infer<typeof ExtractedOpportunitySchema>;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function parseEventDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  const dateOnly = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return new Date(`${dateOnly[1]}T00:00:00.000Z`);
  const naive = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (naive) {
    const ymd = naive[1]!;
    const clock = `${naive[2]}:${naive[3]}:${naive[4] ?? '00'}`;
    if (clock === '00:00:00') return new Date(`${ymd}T00:00:00.000Z`);
    return localWallTimeToUtc(ymd, clock);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

/**
 * Drop inverted ends (end before start) that are not genuine overnight instants.
 * Overnight sources must already encode the next calendar day (or same-day clock bump upstream).
 */
export function sanitizeEventEndInstant(start: Date | null, end: Date | null): Date | null {
  if (!end) return null;
  if (start && end.getTime() < start.getTime()) return null;
  return end;
}

/** Fill listing venue/location/source when a calendar row omitted them. */
export function applyListingProvenance(
  opp: ExtractedOpportunity,
  listing: {
    listingUrl: string;
    listingLocation?: string | null;
    listingVenueName?: string | null;
    publisher?: string | null;
  },
): ExtractedOpportunity {
  const location = opp.location?.trim() || opp.venue?.trim() || listing.listingLocation?.trim() || null;
  const venue = opp.venue?.trim() || listing.listingVenueName?.trim() || null;
  const sourceUrl = opp.sourceUrl?.trim() || listing.listingUrl;
  const businessName = opp.businessName?.trim() || listing.listingVenueName?.trim() || null;
  return {
    ...opp,
    location,
    venue,
    sourceUrl,
    businessName,
    parentArticleUrl: opp.parentArticleUrl?.trim() || listing.listingUrl,
    publisher: opp.publisher?.trim() || listing.publisher?.trim() || null,
  };
}

function isKcMetro(text: string | null | undefined): boolean {
  if (!text) return false;
  return /kansas city|\bkc\b|crossroads|country club plaza|overland park|olathe|independence|lee'?s summit|north kansas city|westport|power\s*&\s*light|union station|kauffman|arrowhead|loose park|first friday|berry hill|parkville|liberty mo|shawnee ks|lenexa|mission ks/i.test(
    text,
  );
}

export function scoreOpportunity(opp: ExtractedOpportunity): {
  relevanceScore: number;
  urgencyScore: number;
} {
  const base = opp.confidence ?? 0.55;
  let relevance = 0.35 + base * 0.35;
  if (isKcMetro(opp.location) || isKcMetro(opp.venue) || isKcMetro(opp.title)) {
    relevance += 0.2;
  }
  if (opp.eventDate) relevance += 0.08;
  if (opp.businessName) relevance += 0.05;
  if (opp.sourceUrl) relevance += 0.05;
  relevance = Math.min(0.99, Math.max(0.1, relevance));

  let urgency = 0.3;
  const starts = parseEventDate(opp.eventDate);
  if (starts) {
    const daysOut = (starts.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysOut < 0) urgency = 0.15;
    else if (daysOut <= 7) urgency = 0.95;
    else if (daysOut <= 21) urgency = 0.75;
    else if (daysOut <= 60) urgency = 0.55;
    else urgency = 0.35;
  }

  return {
    relevanceScore: Number(relevance.toFixed(3)),
    urgencyScore: Number(urgency.toFixed(3)),
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

export async function fetchPageContent(
  url: string,
): Promise<{ ok: boolean; title?: string; description?: string; text?: string; html?: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'BensonBot/1.0 (+https://benson.kckellie.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false };
    const html = await res.text();
    const ogTitle =
      html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i)?.[1];
    const ogDesc =
      html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/content=["']([^"']+)["']\s+property=["']og:description["']/i)?.[1];
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    return {
      ok: true,
      title: ogTitle?.trim() || titleTag?.trim(),
      description: ogDesc?.trim(),
      text: htmlToText(html),
      html,
    };
  } catch {
    return { ok: false };
  }
}

export async function extractOpportunitiesFromPage(input: {
  pageUrl: string;
  pageTitle?: string | null;
  pageDescription?: string | null;
  pageText: string;
  pageHtml?: string | null;
  userMessage?: string;
  discountWatch?: boolean;
  directoryListing?: boolean;
  editorialContainer?: boolean;
}): Promise<z.infer<typeof ExtractionSchema>> {
  const directoryMode =
    input.directoryListing ||
    isDirectoryListingIntake(input.userMessage) ||
    isDirectoryListingContent(input.pageText, input.pageTitle ?? input.pageDescription);

  if (input.editorialContainer && !input.discountWatch && !directoryMode) {
    const prepared = prepareContainerExtraction({
      pageText: input.pageText,
      pageTitle: input.pageTitle,
      pageUrl: input.pageUrl,
      pageHtml: input.pageHtml,
    });
    if (prepared.structuredOpportunities.length >= 2) {
      return {
        documentTitle: input.pageTitle ?? null,
        opportunities: prepared.structuredOpportunities,
      };
    }
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for link collection');
    }
    if (prepared.shouldSplit && prepared.chunks.length > 0) {
      const merged: ExtractedOpportunity[] = [...extractEditorialContainerOpportunities({
        pageText: input.pageText,
        pageTitle: input.pageTitle,
        pageUrl: input.pageUrl,
        pageHtml: input.pageHtml,
      })];
      const chunks = prepared.chunks.slice(0, 8);
      for (const chunk of chunks) {
        const part = await llmExtractOpportunities({
          ...input,
          pageText: chunk,
          editorialContainer: true,
        });
        merged.push(...part.opportunities);
      }
      return {
        documentTitle: input.pageTitle ?? null,
        opportunities: finalizeContainerOpportunities(merged, input.pageTitle),
      };
    }
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for link collection');
  }

  return llmExtractOpportunities(input);
}

async function llmExtractOpportunities(input: {
  pageUrl: string;
  pageTitle?: string | null;
  pageDescription?: string | null;
  pageText: string;
  userMessage?: string;
  discountWatch?: boolean;
  directoryListing?: boolean;
  editorialContainer?: boolean;
}): Promise<z.infer<typeof ExtractionSchema>> {
  const directoryMode =
    input.directoryListing ||
    isDirectoryListingIntake(input.userMessage) ||
    isDirectoryListingContent(input.pageText, input.pageTitle ?? input.pageDescription);

  const systemContent = input.discountWatch
    ? `You extract structured Kansas City discount and luxury deal opportunities from offer/sale pages (NowInStock-style).
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Each opportunity needs title. Include price, percent off, or package price in summary when visible.
Categories: luxury_deal, hotel_package, spa_package, deal, consignment_event, luxury_resale, warehouse_sale, shopping_event, holiday_sale, retail_sale, seasonal_sale, major_discount, thrift_sale, grocery_deal.
Include holiday sales (Black Friday, Memorial Day, Labor Day, Christmas), mall/outlet promotions, thrift half-price days, and grocery weekly deals when present.
Include location, venue, businessName, eventDate (ISO 8601 when possible), sourceUrl (detail link), tags, confidence 0-1.
One row per distinct offer/package/sale — not generic site navigation. Only extract offers present in the page text.`
    : directoryMode
      ? `You extract structured Kansas City business and place discoveries from directory and listing pages.
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Each opportunity needs title (business or place name). Include businessName, location/neighborhood, category, sourceUrl (detail link when available), tags, confidence 0-1.
For business directories (Black-owned lists, shop guides, restaurant roundups): one opportunity per distinct business — not one row for the whole page.
eventDate is optional — omit when the listing is not date-specific.
Categories: black_owned_business, local_business, restaurant, retail, service, place_discovery.
Only extract businesses actually present in the page text. Do not invent listings.`
      : input.editorialContainer
      ? `You extract concrete child events from an editorial roundup, guide, schedule, or listing hub.
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Do NOT emit the parent article/page title as an event.
One opportunity per distinct dated event or performance actually on the page.
Each child needs its own title, start date (ISO 8601 date when a real calendar date is present), start time when shown, venue, city/address when shown, sourceUrl (child detail link when present), and a short description.
If the page is a neighborhood guide with places but no dated events, return opportunities: [] — do not invent dates or midnight times.
Never invent 12:00 AM / midnight because a date parser lacked a time.`
      : `You extract structured Kansas City content opportunities from web pages.
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Each opportunity needs title. Include location, venue, businessName, eventDate (ISO 8601 when possible), category, sourceUrl (event detail link when available), tags, confidence 0-1.
For event calendars, bucket lists, venue schedules: one opportunity per distinct event/activity — never one row named after the parent article or schedule page.
For business directories and shop lists: one opportunity per business (eventDate optional).
Only extract events and businesses actually present in the page text. Do not invent events or midnight times.`;

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: systemContent,
      },
      {
        role: 'user',
        content: JSON.stringify({
          instruction:
            input.userMessage?.trim() ||
            (directoryMode
              ? 'Extract every business or place from this directory or listing page.'
              : input.editorialContainer
                ? 'Extract each dated child event. Do not emit the parent article title as an event, and do not invent midnight times.'
                : 'Extract every event or opportunity from this page as structured rows.'),
          pageUrl: input.pageUrl,
          pageTitle: input.pageTitle ?? null,
          pageDescription: input.pageDescription ?? null,
          pageText: input.pageText,
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty link extraction response');
  return ExtractionSchema.parse(JSON.parse(content));
}

export function parseScrapeListingConfig(raw: unknown): {
  listingUrl: string;
  discountWatch?: boolean;
  opportunityCategory?: string;
} {
  const config = (raw ?? {}) as Record<string, unknown>;
  const listingUrl =
    typeof config.listingUrl === 'string'
      ? config.listingUrl
      : typeof config.url === 'string'
        ? config.url
        : '';
  if (!listingUrl.trim()) {
    throw new Error('scrape source missing listingUrl in config');
  }
  return {
    listingUrl: listingUrl.trim(),
    discountWatch: config.discountWatch === true,
    opportunityCategory:
      typeof config.opportunityCategory === 'string' ? config.opportunityCategory : undefined,
  };
}
