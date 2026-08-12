import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { campaigns, contentItems, type NewContentItem } from '../schema.js';
import { env } from '../env.js';
import { persistIngestedContentItem } from '../scanner/ingest-persist.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { researchOpportunity } from '../web-research/index.js';
import { promotePendingAskBensonProposals } from '../source-ingestion/register-scrape-source.js';
import {
  countRegisteredScrapeSources,
  registerAskBensonListingUrl,
  registerAskBensonResearchCitations,
} from './register-scrape.js';
import type { RegisterScrapeSourceResult } from '../source-ingestion/register-scrape-source.js';
import { isDirectoryListingContent, isDirectoryListingIntake } from './intake-intents.js';
import type { AskBensonImageAttachment } from './types.js';

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

export type ExtractedImageOpportunity = z.infer<typeof ExtractedOpportunitySchema>;

export type CollectedOpportunityRow = {
  contentItemId: string;
  title: string;
  location: string | null;
  eventStartsAt: string | null;
  relevanceScore: number;
  urgencyScore: number;
  outcome: 'created' | 'updated';
  sourceUrl: string | null;
};

export type CollectFromImageResult = {
  documentTitle: string | null;
  extractedCount: number;
  created: number;
  updated: number;
  items: CollectedOpportunityRow[];
  enrichmentsAttempted: number;
  webResearchAttempted: number;
  sourceProposalsCreated: number;
  scrapeSourcesRegistered?: number;
};

const MAX_WEB_RESEARCH_PER_UPLOAD = 3;

async function defaultCampaignId(): Promise<string> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('No active campaign found');
  return campaign.id;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function parseEventDate(raw: string | null | undefined): Date | null {
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

function scoreOpportunity(opp: ExtractedImageOpportunity): {
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

async function enrichFromUrl(
  url: string,
): Promise<{ title?: string; description?: string; ok: boolean }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
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
    return {
      ok: true,
      title: ogTitle?.trim(),
      description: ogDesc?.trim(),
    };
  } catch {
    return { ok: false };
  }
}

function imageExtractionSystemPrompt(directoryMode: boolean): string {
  if (directoryMode) {
    return `You extract structured Kansas City business and place discoveries from directory screenshots and listing pages.
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Each opportunity needs title (business or place name). Include businessName, location/neighborhood, category, tags, confidence 0-1.
For business directories (Black-owned lists, shop guides, restaurant roundups): one opportunity per distinct business or place — not one row for the whole page.
eventDate is optional — omit it when the listing is not date-specific.
Categories: black_owned_business, local_business, restaurant, retail, service, place_discovery, directory_listing.
Tags should reflect visible themes (e.g. black-owned, coffee, salon, boutique) when readable.
Never return an empty opportunities array when readable business names are visible.
Do not invent businesses not visible in the image. Skip illegible lines.`;
  }

  return `You extract structured Kansas City content opportunities from images.
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Each opportunity needs title. Include location, venue, businessName, eventDate (ISO 8601 when possible), category, sourceUrl (only if visible), tags, confidence 0-1.
For event lists, flyers, bucket lists, calendars: one opportunity per distinct event/activity.
For business directories and shop lists: one opportunity per business (eventDate optional).
For a single event flyer, screenshot, or social post: return at least one opportunity if any event, venue, or business name is readable.
Never return an empty opportunities array when readable event, business, or venue text is visible.
Do not invent events or businesses not visible in the image. Skip illegible lines.`;
}

export async function extractOpportunitiesFromImage(
  image: AskBensonImageAttachment,
  userMessage?: string,
): Promise<z.infer<typeof ExtractionSchema>> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for image collection');
  }

  const directoryMode = isDirectoryListingIntake(userMessage);
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: imageExtractionSystemPrompt(directoryMode),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              instruction:
                userMessage?.trim() ||
                (directoryMode
                  ? 'Extract every business or place visible in this directory or listing page.'
                  : 'Extract every event, business, or opportunity visible in this image as structured rows.'),
            }),
          },
          {
            type: 'image_url',
            image_url: { url: image.dataUrl, detail: 'high' },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty extraction response');
  return ExtractionSchema.parse(JSON.parse(content));
}

export async function collectOpportunitiesFromImage(input: {
  image: AskBensonImageAttachment;
  userMessage?: string;
  campaignId?: string;
}): Promise<CollectFromImageResult> {
  const campaignId = input.campaignId ?? (await defaultCampaignId());
  const sourceId = await getOrCreateShareIntakeSource(campaignId);
  const directoryMode =
    isDirectoryListingIntake(input.userMessage) ||
    isDirectoryListingContent(input.userMessage);
  let extraction = await extractOpportunitiesFromImage(input.image, input.userMessage);
  if (
    !directoryMode &&
    isDirectoryListingContent(extraction.documentTitle, input.userMessage)
  ) {
    extraction = await extractOpportunitiesFromImage(
      input.image,
      [input.userMessage, 'This is a business directory or listing page — extract each business.']
        .filter(Boolean)
        .join(' '),
    );
  }

  if (extraction.opportunities.length === 0 && extraction.documentTitle?.trim()) {
    extraction = {
      ...extraction,
      opportunities: [
        {
          title: extraction.documentTitle.trim(),
          summary: input.userMessage?.trim() || null,
          confidence: 0.45,
        },
      ],
    };
  }

  const batchId = createHash('sha256')
    .update(input.image.contentHash)
    .digest('hex')
    .slice(0, 16);

  let created = 0;
  let updated = 0;
  let enrichmentsAttempted = 0;
  let webResearchAttempted = 0;
  let sourceProposalsCreated = 0;
  const registrationResults: RegisterScrapeSourceResult[] = [];
  const items: CollectedOpportunityRow[] = [];
  const registeredUrls = new Set<string>();

  for (let i = 0; i < extraction.opportunities.length; i++) {
    const opp = extraction.opportunities[i]!;
    let summary = opp.summary?.trim() || null;
    let title = opp.title.trim();
    let sourceUrl = opp.sourceUrl?.trim() || null;
    let webResearch: { summary: string | null; links: string[] } | null = null;

    if (sourceUrl) {
      enrichmentsAttempted += 1;
      const enriched = await enrichFromUrl(sourceUrl);
      if (enriched.title && enriched.title.length > title.length) {
        title = enriched.title.slice(0, 500);
      }
      if (enriched.description && !summary) {
        summary = enriched.description.slice(0, 800);
      }
      if (!registeredUrls.has(sourceUrl)) {
        registeredUrls.add(sourceUrl);
        const registered = await registerAskBensonListingUrl({
          campaignId,
          url: sourceUrl,
          title,
          rationale: 'Found on uploaded flyer/image via Ask Benson.',
          metadata: { discoveredVia: 'ask_benson_image_page' },
        });
        registrationResults.push(registered);
        if (registered.ok) sourceProposalsCreated += 1;
      }
    }

    // Internet research: find official pages/dates/links for the top extracted items.
    if (webResearchAttempted < MAX_WEB_RESEARCH_PER_UPLOAD) {
      webResearchAttempted += 1;
      const research = await researchOpportunity({
        title,
        location: opp.location ?? opp.venue,
        businessName: opp.businessName,
      });
      if (research.ok && (research.summary || research.citations.length > 0)) {
        webResearch = {
          summary: research.summary,
          links: research.citations.map((c) => c.url).slice(0, 5),
        };
        if (!sourceUrl && research.citations[0]) {
          sourceUrl = research.citations[0].url;
        }
        if (research.summary) {
          summary = summary
            ? `${summary}\n\nWeb research: ${research.summary}`.slice(0, 3000)
            : research.summary.slice(0, 3000);
        }
        sourceProposalsCreated += await registerAskBensonResearchCitations(campaignId, research, {
          title,
          discoveredVia: 'ask_benson_image_research',
        });
      }
    }

    const { relevanceScore, urgencyScore } = scoreOpportunity(opp);
    const eventStartsAt = parseEventDate(opp.eventDate);
    const externalId = `ask-benson-${batchId}-${i}-${slugify(title)}`;

    const row: NewContentItem = {
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: title.slice(0, 500),
      hook: extraction.documentTitle?.slice(0, 500) ?? 'Captured from Ask Benson image',
      script: summary?.slice(0, 4000) ?? null,
      sourceId,
      sourceExternalId: externalId,
      sourceUrl,
      discoveredAt: new Date(),
      eventStartsAt,
      eventEndsAt: parseEventDate(opp.eventEndDate),
      locationName: opp.location?.trim() || opp.venue?.trim() || null,
      relevanceScore: String(relevanceScore),
      urgencyScore: String(urgencyScore),
      metadata: {
        ingest: 'ask_benson_image',
        opportunityCategory:
          opp.category ??
          (directoryMode || isDirectoryListingContent(opp.title, opp.summary) ? 'local_business' : 'local_event'),
        tags: opp.tags ?? [],
        askBensonCapture: {
          batchId,
          imageHash: input.image.contentHash,
          documentTitle: extraction.documentTitle,
          businessName: opp.businessName,
          extractionConfidence: opp.confidence ?? null,
          enrichedFromUrl: Boolean(sourceUrl),
          webResearch,
        },
      },
      rawPayload: {
        extracted: opp,
        documentTitle: extraction.documentTitle,
        imageHash: input.image.contentHash,
      },
    };

    const outcome = await persistIngestedContentItem(sourceId, externalId, () => row, {
      sourceUrl,
    });

    let saved = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceExternalId, externalId),
    });
    if (!saved && sourceUrl) {
      saved = await db.query.contentItems.findFirst({
        where: eq(contentItems.sourceUrl, sourceUrl),
      });
    }
    if (!saved) continue;

    const rowOutcome: 'created' | 'updated' =
      outcome === 'created' ? 'created' : 'updated';
    if (outcome === 'created') created += 1;
    else if (outcome === 'updated') updated += 1;
    else continue;

    items.push({
      contentItemId: saved.id,
      title: saved.topic,
      location: saved.locationName,
      eventStartsAt: saved.eventStartsAt?.toISOString() ?? null,
      relevanceScore,
      urgencyScore,
      outcome: rowOutcome,
      sourceUrl: saved.sourceUrl,
    });
  }

  const backfilled = await promotePendingAskBensonProposals(campaignId);

  return {
    documentTitle: extraction.documentTitle ?? null,
    extractedCount: extraction.opportunities.length,
    created,
    updated,
    items,
    enrichmentsAttempted,
    webResearchAttempted,
    sourceProposalsCreated,
    scrapeSourcesRegistered: countRegisteredScrapeSources(registrationResults) + backfilled,
  };
}
