import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { campaigns, contentItems, type NewContentItem } from '../schema.js';
import { env } from '../env.js';
import { persistIngestedContentItem } from '../scanner/ingest-persist.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { researchOpportunity, searchWeb } from '../web-research/index.js';
import { promotePendingAskBensonProposals } from '../source-ingestion/register-scrape-source.js';
import {
  countRegisteredScrapeSources,
  registerAskBensonListingUrl,
  registerAskBensonResearchCitations,
} from './register-scrape.js';
import type { RegisterScrapeSourceResult } from '../source-ingestion/register-scrape-source.js';
import type { CollectFromImageResult } from './collect-from-image.js';

const MODEL = 'gpt-4o-mini';
const MAX_WEB_RESEARCH = 3;

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
  opportunities: z.array(ExtractedOpportunitySchema).max(20),
});

export type CollectFromLookupResult = CollectFromImageResult & {
  lookupQuery: string;
};

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

function scoreOpportunity(opp: z.infer<typeof ExtractedOpportunitySchema>): {
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

async function extractFromResearch(input: {
  query: string;
  researchText: string;
  userMessage?: string;
}): Promise<z.infer<typeof ExtractionSchema>> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for lookup collection');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You extract structured Kansas City content opportunities from web research.
Return JSON: { "documentTitle": string|null, "opportunities": [...] }.
Each opportunity needs title. Include location, venue, businessName, eventDate (ISO 8601 when possible), category, sourceUrl, tags, confidence 0-1.
Only extract real events or opportunities supported by the research text. Do not invent.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          instruction:
            input.userMessage?.trim() ||
            `Extract opportunities related to: ${input.query}`,
          lookupQuery: input.query,
          researchText: input.researchText.slice(0, 10000),
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty lookup extraction response');
  return ExtractionSchema.parse(JSON.parse(content));
}

export async function collectOpportunitiesFromLookup(input: {
  query: string;
  userMessage?: string;
  campaignId?: string;
}): Promise<CollectFromLookupResult> {
  const campaignId = input.campaignId ?? (await defaultCampaignId());
  const sourceId = await getOrCreateShareIntakeSource(campaignId);
  const lookupQuery = input.query.trim();

  const research = await searchWeb(
    `${lookupQuery} Kansas City events dates venue tickets ${new Date().getFullYear()}`,
    'Find official event pages, dates, venue, and ticket links for Kansas City metro. Cite URLs. Under 250 words.',
  );

  const researchText = [
    research.summary ?? '',
    ...research.citations.map((c) => `${c.title ?? 'source'}: ${c.url}`),
  ]
    .filter(Boolean)
    .join('\n');

  if (!research.ok || !researchText.trim()) {
    return {
      documentTitle: lookupQuery,
      extractedCount: 0,
      created: 0,
      updated: 0,
      items: [],
      enrichmentsAttempted: 0,
      webResearchAttempted: 1,
      sourceProposalsCreated: 0,
      lookupQuery,
    };
  }

  const extraction = await extractFromResearch({
    query: lookupQuery,
    researchText,
    userMessage: input.userMessage,
  });

  let created = 0;
  let updated = 0;
  let enrichmentsAttempted = 0;
  let webResearchAttempted = 1;
  let sourceProposalsCreated = 0;
  const registrationResults: RegisterScrapeSourceResult[] = [];
  const registeredUrls = new Set<string>();
  const items: CollectFromLookupResult['items'] = [];
  const documentTitle = extraction.documentTitle ?? lookupQuery;
  const batchId = createHash('sha256').update(lookupQuery).digest('hex').slice(0, 16);

  for (let i = 0; i < extraction.opportunities.length; i++) {
    const opp = extraction.opportunities[i]!;
    let summary = opp.summary?.trim() || research.summary?.trim() || null;
    let title = opp.title.trim();
    let sourceUrl = opp.sourceUrl?.trim() || research.citations[0]?.url || null;

    enrichmentsAttempted += 1;
    if (webResearchAttempted <= MAX_WEB_RESEARCH) {
      webResearchAttempted += 1;
      const extra = await researchOpportunity({
        title,
        location: opp.location ?? opp.venue,
        businessName: opp.businessName ?? lookupQuery,
      });
      if (extra.ok && extra.summary) {
        summary = summary
          ? `${summary}\n\nWeb research: ${extra.summary}`.slice(0, 3000)
          : extra.summary.slice(0, 3000);
        if (extra.citations[0]?.url) sourceUrl = extra.citations[0].url;
      }
      if (extra.ok) {
        sourceProposalsCreated += await registerAskBensonResearchCitations(campaignId, extra, {
          title,
          discoveredVia: 'ask_benson_lookup_research',
        });
      }
    }

    if (sourceUrl && !registeredUrls.has(sourceUrl)) {
      registeredUrls.add(sourceUrl);
      const registered = await registerAskBensonListingUrl({
        campaignId,
        url: sourceUrl,
        title,
        rationale: `Lookup result for "${lookupQuery}" — added to recurring scrape list.`,
        metadata: { discoveredVia: 'ask_benson_lookup_page', lookupQuery },
      });
      registrationResults.push(registered);
      if (registered.ok) sourceProposalsCreated += 1;
    }

    const { relevanceScore, urgencyScore } = scoreOpportunity(opp);
    const externalId = `ask-benson-lookup-${batchId}-${i}-${slugify(title)}`;

    const row: NewContentItem = {
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: title.slice(0, 500),
      hook: documentTitle.slice(0, 500),
      script: summary?.slice(0, 4000) ?? null,
      sourceId,
      sourceExternalId: externalId,
      sourceUrl,
      discoveredAt: new Date(),
      eventStartsAt: parseEventDate(opp.eventDate),
      eventEndsAt: parseEventDate(opp.eventEndDate),
      locationName: opp.location?.trim() || opp.venue?.trim() || null,
      relevanceScore: String(relevanceScore),
      urgencyScore: String(urgencyScore),
      metadata: {
        ingest: 'ask_benson_lookup',
        opportunityCategory: opp.category ?? 'local_event',
        tags: opp.tags ?? [],
        askBensonCapture: {
          batchId,
          lookupQuery,
          documentTitle,
          businessName: opp.businessName ?? lookupQuery,
          extractionConfidence: opp.confidence ?? null,
          webResearch: research.ok
            ? { summary: research.summary, links: research.citations.map((c) => c.url).slice(0, 5) }
            : null,
        },
      },
      rawPayload: { extracted: opp, lookupQuery, researchText: researchText.slice(0, 4000) },
    };

    const outcome = await persistIngestedContentItem(sourceId, externalId, () => row, {
      sourceUrl,
    });

    const saved = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceExternalId, externalId),
    });
    if (!saved) continue;

    const rowOutcome: 'created' | 'updated' = outcome === 'created' ? 'created' : 'updated';
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
    documentTitle,
    extractedCount: extraction.opportunities.length,
    created,
    updated,
    items,
    enrichmentsAttempted,
    webResearchAttempted,
    sourceProposalsCreated,
    scrapeSourcesRegistered: countRegisteredScrapeSources(registrationResults) + backfilled,
    lookupQuery,
  };
}
