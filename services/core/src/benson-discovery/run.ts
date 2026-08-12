import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { bensonDiscoveries, campaigns, contentItems, type NewContentItem } from '../schema.js';
import { env } from '../env.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { persistIngestedContentItem } from '../scanner/ingest-persist.js';
import { scoreContentItemIds } from '../opportunity-scoring/index.js';
import { searchWeb } from '../web-research/index.js';
import { pickDiscoveryQueries } from './queries.js';
import { registerDiscoveryCalendarSource } from '../source-ingestion/city-coverage-sources.js';
import {
  getEffectiveDiscoveryQueryCount,
  maybeAlertBudgetExceeded,
  shouldSkipBackgroundLlm,
} from '../llm-spend/index.js';
import { getActiveShootSession } from '../shoot-mode/index.js';
import { loadSkipMatchers, isSkippedByMatchers } from '../creator-skip/index.js';

const MODEL = env.BENSON_ASK_MODEL;
const MAX_ITEMS_PER_QUERY = 5;
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.6;

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
  opportunities: z.array(ExtractedOpportunitySchema).max(8),
});

export type DiscoveryItem = {
  contentItemId: string;
  title: string;
  location: string | null;
  eventStartsAt: string | null;
  sourceUrl: string | null;
  outcome: 'created' | 'updated';
};

export type DiscoveryRunResult = {
  ran: boolean;
  reason: string;
  discoveryId?: string;
  created?: number;
  updated?: number;
  scoredCount?: number;
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

function scoreOpportunity(opp: z.infer<typeof ExtractedOpportunitySchema>): {
  relevanceScore: number;
  urgencyScore: number;
} {
  let relevance = 0.62;
  if (opp.location || opp.venue) relevance += 0.08;
  if (opp.eventDate) relevance += 0.08;
  if (opp.sourceUrl) relevance += 0.06;
  if ((opp.confidence ?? 0) >= 0.7) relevance += 0.05;

  let urgency = 0.35;
  const starts = parseEventDate(opp.eventDate);
  if (starts) {
    const daysOut = (starts.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysOut < 0) urgency = 0.15;
    else if (daysOut <= 1) urgency = 0.92;
    else if (daysOut <= 7) urgency = 0.78;
    else if (daysOut <= 21) urgency = 0.58;
  }

  return {
    relevanceScore: Number(Math.min(0.99, relevance).toFixed(3)),
    urgencyScore: Number(Math.min(0.99, urgency).toFixed(3)),
  };
}

async function extractFromResearch(input: {
  query: string;
  researchText: string;
}): Promise<{
  extraction: z.infer<typeof ExtractionSchema>;
  tokenUsage: { prompt: number; completion: number };
}> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for Benson local discovery');
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
          instruction: `Scout fresh local opportunities for: ${input.query}`,
          lookupQuery: input.query,
          researchText: input.researchText.slice(0, 10000),
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty discovery extraction response');

  return {
    extraction: ExtractionSchema.parse(JSON.parse(content)),
    tokenUsage: {
      prompt: response.usage?.prompt_tokens ?? 0,
      completion: response.usage?.completion_tokens ?? 0,
    },
  };
}

async function scoutQuery(
  query: string,
  campaignId: string,
  sourceId: string,
  runBatch: string,
): Promise<{
  items: DiscoveryItem[];
  created: number;
  updated: number;
  citations: Array<{ url: string; title: string | null }>;
  summary: string | null;
  tokenUsage: { prompt: number; completion: number };
}> {
  const year = new Date().getFullYear();
  const research = await searchWeb(
    `${query} Kansas City metro ${year}`,
    'Find official event pages, dates, venue, and ticket links for Kansas City metro. Cite URLs. Under 250 words.',
    { context: 'background' },
  );

  const researchText = [
    research.summary ?? '',
    ...research.citations.map((c) => `${c.title ?? 'source'}: ${c.url}`),
  ]
    .filter(Boolean)
    .join('\n');

  if (!research.ok || !researchText.trim()) {
    return {
      items: [],
      created: 0,
      updated: 0,
      citations: research.citations,
      summary: research.summary,
      tokenUsage: { prompt: 0, completion: 0 },
    };
  }

  const { extraction, tokenUsage: extractUsage } = await extractFromResearch({ query, researchText });

  let created = 0;
  let updated = 0;
  const items: DiscoveryItem[] = [];
  const documentTitle = extraction.documentTitle ?? query;

  for (let i = 0; i < Math.min(extraction.opportunities.length, MAX_ITEMS_PER_QUERY); i++) {
    const opp = extraction.opportunities[i]!;
    const title = opp.title.trim();
    const sourceUrl = opp.sourceUrl?.trim() || research.citations[0]?.url || null;
    const summary = opp.summary?.trim() || research.summary?.trim() || null;
    const { relevanceScore, urgencyScore } = scoreOpportunity(opp);
    const externalId = `benson-discovery-${runBatch}-${slugify(query)}-${i}-${slugify(title)}`;

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
        ingest: 'benson_discovery',
        opportunityCategory: opp.category ?? 'local_event',
        tags: opp.tags ?? [],
        bensonDiscovery: {
          runBatch,
          searchQuery: query,
          documentTitle,
          businessName: opp.businessName ?? query,
          extractionConfidence: opp.confidence ?? null,
        },
      },
      rawPayload: { extracted: opp, searchQuery: query, researchText: researchText.slice(0, 4000) },
    };

    const outcome = await persistIngestedContentItem(sourceId, externalId, () => row, {
      sourceUrl,
    });

    const saved = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceExternalId, externalId),
    });
    if (!saved) continue;

    if (outcome === 'created') created += 1;
    else if (outcome === 'updated') updated += 1;
    else continue;

    items.push({
      contentItemId: saved.id,
      title: saved.topic,
      location: saved.locationName,
      eventStartsAt: saved.eventStartsAt?.toISOString() ?? null,
      sourceUrl: saved.sourceUrl,
      outcome: outcome === 'created' ? 'created' : 'updated',
    });
  }

  return {
    items,
    created,
    updated,
    citations: research.citations,
    summary: research.summary,
    tokenUsage: extractUsage,
  };
}

async function shouldSkipDiscoveryForFullInbox(): Promise<{ skip: boolean; reason: string | null }> {
  const [last] = await db
    .select({ createdCount: bensonDiscoveries.createdCount })
    .from(bensonDiscoveries)
    .orderBy(desc(bensonDiscoveries.createdAt))
    .limit(1);

  if (!last || last.createdCount > 0) {
    return { skip: false, reason: null };
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.state} = 'planned'`,
        gte(contentItems.createdAt, cutoff),
      ),
    );

  if (Number(row?.count ?? 0) >= 80) {
    return { skip: true, reason: 'inbox_full_last_run_empty' };
  }
  return { skip: false, reason: null };
}

export async function runBensonLocalDiscovery(): Promise<DiscoveryRunResult> {
  if (!env.OPENAI_API_KEY) {
    return { ran: false, reason: 'openai_missing' };
  }

  const gate = await shouldSkipBackgroundLlm('discovery');
  if (gate.skip) {
    return { ran: false, reason: gate.reason ?? 'discovery_skipped' };
  }

  const activeShoot = await getActiveShootSession().catch(() => null);
  if (activeShoot) {
    return { ran: false, reason: 'active_shoot_session' };
  }

  const inboxGate = await shouldSkipDiscoveryForFullInbox();
  if (inboxGate.skip) {
    return { ran: false, reason: inboxGate.reason ?? 'inbox_full' };
  }

  const queryCount = await getEffectiveDiscoveryQueryCount();
  const bucket = Math.floor(Date.now() / env.BENSON_DISCOVERY_INTERVAL_MS);
  const queries = pickDiscoveryQueries(queryCount, bucket);
  const runHash = createHash('sha256')
    .update(`${bucket}:${queries.join('|')}`)
    .digest('hex')
    .slice(0, 24);

  const [existing] = await db
    .select({ id: bensonDiscoveries.id })
    .from(bensonDiscoveries)
    .where(eq(bensonDiscoveries.runHash, runHash))
    .limit(1);

  if (existing) {
    return { ran: false, reason: 'already_ran', discoveryId: existing.id };
  }

  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateShareIntakeSource(campaignId);
  const runBatch = runHash.slice(0, 12);

  let created = 0;
  let updated = 0;
  const allItems: DiscoveryItem[] = [];
  const allCitations: Array<{ url: string; title: string | null }> = [];
  const summaryParts: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;

  for (const query of queries) {
    const result = await scoutQuery(query, campaignId, sourceId, runBatch);
    created += result.created;
    updated += result.updated;
    allItems.push(...result.items);
    allCitations.push(...result.citations);
    if (result.summary) summaryParts.push(`${query}: ${result.summary}`);
    promptTokens += result.tokenUsage.prompt;
    completionTokens += result.tokenUsage.completion;

    for (const citation of result.citations) {
      try {
        await registerDiscoveryCalendarSource({
          campaignId,
          url: citation.url,
          title: citation.title,
        });
      } catch {
        /* best-effort */
      }
    }
  }

  const skipMatchers = await loadSkipMatchers();
  const visibleItems = allItems.filter(
    (item) =>
      !isSkippedByMatchers(skipMatchers, {
        id: item.contentItemId,
        title: item.title,
        eventDate: item.eventStartsAt,
        locationName: item.location,
        sourceUrl: item.sourceUrl,
      }),
  );

  const newIds = visibleItems.filter((item) => item.outcome === 'created').map((item) => item.contentItemId);
  const scoredCount = newIds.length > 0 ? await scoreContentItemIds(newIds) : 0;

  const summary =
    summaryParts.join('\n\n').slice(0, 4000) ||
    (visibleItems.length > 0
      ? `Scouted ${visibleItems.length} local opportunities from ${queries.length} web searches.`
      : 'No new local opportunities found this run.');

  const estimatedCost =
    (promptTokens / 1_000_000) * INPUT_COST_PER_M +
    (completionTokens / 1_000_000) * OUTPUT_COST_PER_M;

  const [row] = await db
    .insert(bensonDiscoveries)
    .values({
      runHash,
      searchQueries: queries,
      summary,
      citations: allCitations.slice(0, 20),
      itemsFound: visibleItems.slice(0, 20),
      createdCount: created,
      updatedCount: updated,
      scoredCount,
      tokenUsage: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
      estimatedCost: String(estimatedCost),
    })
    .returning({ id: bensonDiscoveries.id });

  console.log(
    `[benson-discovery] ${queries.join(' | ')} → ${created} new, ${updated} updated, ${scoredCount} scored`,
  );

  await maybeAlertBudgetExceeded();

  if (created > 0) {
    try {
      const { sendBensonPush } = await import('../push-notifications/index.js');
      const topTitle = visibleItems[0]?.title;
      await sendBensonPush({
        topic: 'local_discovery',
        title: 'Benson · local finds',
        body: topTitle
          ? `${created} new — ${topTitle}${created > 1 ? ` (+${created - 1} more)` : ''}`
          : `${created} new KC opportunities scouted`,
        url: '/review/inventory',
      });
    } catch (err) {
      console.warn('[benson-discovery] push failed:', err instanceof Error ? err.message : err);
    }
  }

  return {
    ran: true,
    reason: allItems.length > 0 ? 'found_items' : 'no_items',
    discoveryId: row?.id,
    created,
    updated,
    scoredCount,
  };
}
