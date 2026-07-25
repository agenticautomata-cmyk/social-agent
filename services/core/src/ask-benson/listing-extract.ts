import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';

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
  const parsed = Date.parse(raw.trim());
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
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
): Promise<{ ok: boolean; title?: string; description?: string; text?: string }> {
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
  userMessage?: string;
  discountWatch?: boolean;
}): Promise<z.infer<typeof ExtractionSchema>> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for link collection');
  }

  const systemContent = input.discountWatch
    ? `You extract structured Kansas City discount and luxury deal opportunities from offer/sale pages (NowInStock-style).
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Each opportunity needs title. Include price, percent off, or package price in summary when visible.
Categories: luxury_deal, hotel_package, spa_package, deal, consignment_event, luxury_resale, warehouse_sale, shopping_event, holiday_sale, retail_sale, seasonal_sale, major_discount, thrift_sale, grocery_deal.
Include holiday sales (Black Friday, Memorial Day, Labor Day, Christmas), mall/outlet promotions, thrift half-price days, and grocery weekly deals when present.
Include location, venue, businessName, eventDate (ISO 8601 when possible), sourceUrl (detail link), tags, confidence 0-1.
One row per distinct offer/package/sale — not generic site navigation. Only extract offers present in the page text.`
    : `You extract structured Kansas City content opportunities from web pages.
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Each opportunity needs title. Include location, venue, businessName, eventDate (ISO 8601 when possible), category, sourceUrl (event detail link when available), tags, confidence 0-1.
For event calendars, bucket lists, venue schedules: one opportunity per distinct event/activity.
Only extract events actually present in the page text. Do not invent events.`;

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
            'Extract every event or opportunity from this page as structured rows.',
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
