import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, type NewContentItem } from '../schema.js';
import { persistIngestedContentItem } from '../scanner/ingest-persist.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { researchOpportunity, searchWeb, type WebResearchResult } from '../web-research/index.js';
import {
  extractOpportunitiesFromPage,
  fetchPageContent,
  parseEventDate,
  scoreOpportunity,
  slugify,
} from './listing-extract.js';
import {
  countRegisteredScrapeSources,
  registerAskBensonListingUrl,
  registerAskBensonResearchCitations,
} from './register-scrape.js';
import {
  promotePendingAskBensonProposals,
  type RegisterScrapeSourceResult,
} from '../source-ingestion/register-scrape-source.js';
import type { CollectFromImageResult } from './collect-from-image.js';

const MAX_URLS_PER_MESSAGE = 2;
const MAX_WEB_RESEARCH_PER_LINK = 3;

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

export type CollectFromLinkResult = CollectFromImageResult & {
  sourceUrls: string[];
  scrapeSourcesRegistered?: number;
};

export function extractUrls(message: string, max = MAX_URLS_PER_MESSAGE): string[] {
  const matches = message.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?)]+$/, '');
    try {
      new URL(url);
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}

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

async function proposeSourcesFromResearch(
  campaignId: string,
  research: WebResearchResult,
  context: { title: string; pageUrl: string },
): Promise<number> {
  return registerAskBensonResearchCitations(campaignId, research, {
    title: context.title,
    pageUrl: context.pageUrl,
    discoveredVia: 'ask_benson_link_research',
  });
}

export async function collectOpportunitiesFromLink(input: {
  urls: string[];
  userMessage?: string;
  campaignId?: string;
}): Promise<CollectFromLinkResult> {
  const campaignId = input.campaignId ?? (await defaultCampaignId());
  const sourceId = await getOrCreateShareIntakeSource(campaignId);

  let created = 0;
  let updated = 0;
  let enrichmentsAttempted = 0;
  let webResearchAttempted = 0;
  let sourceProposalsCreated = 0;
  const registrationResults: RegisterScrapeSourceResult[] = [];
  const items: CollectFromLinkResult['items'] = [];
  let extractedCount = 0;
  let documentTitle: string | null = null;

  for (const pageUrl of input.urls) {
    let page = await fetchPageContent(pageUrl);
    if (!page.ok || !page.text) {
      webResearchAttempted += 1;
      const research = await searchWeb(
        `Find events and opportunities from this page or organization: ${pageUrl}. ${input.userMessage ?? ''}`.trim(),
        'Find official event listings, dates, venue, and ticket links for Kansas City metro when relevant. Cite URLs. Under 250 words.',
      );
      if (research.ok && (research.summary || research.citations.length > 0)) {
        page = {
          ok: true,
          title: research.citations[0]?.title ?? pageUrl,
          description: research.summary?.slice(0, 500),
          text: [
            research.summary ?? '',
            ...research.citations.map((c) => `${c.title ?? 'source'}: ${c.url}`),
          ]
            .filter(Boolean)
            .join('\n'),
        };
      } else {
        continue;
      }
    }

    if (!page.text) continue;

    const extraction = await extractOpportunitiesFromPage({
      pageUrl,
      pageTitle: page.title,
      pageDescription: page.description,
      pageText: page.text,
      userMessage: input.userMessage,
    });

    documentTitle = extraction.documentTitle ?? page.title ?? documentTitle;
    extractedCount += extraction.opportunities.length;

    if (extraction.opportunities.length >= 1) {
      const registered = await registerAskBensonListingUrl({
        campaignId,
        url: pageUrl,
        title: documentTitle,
        rationale: 'User shared this listing page in chat — added to recurring scrape list.',
        metadata: { discoveredVia: 'ask_benson_link_page' },
      });
      registrationResults.push(registered);
      if (registered.ok) sourceProposalsCreated += 1;
    }

    const batchId = createHash('sha256').update(pageUrl).digest('hex').slice(0, 16);

    for (let i = 0; i < extraction.opportunities.length; i++) {
      const opp = extraction.opportunities[i]!;
      let summary = opp.summary?.trim() || page.description?.trim() || null;
      let title = opp.title.trim();
      let sourceUrl = opp.sourceUrl?.trim() || pageUrl;
      let webResearch: { summary: string | null; links: string[] } | null = null;

      enrichmentsAttempted += 1;
      if (sourceUrl !== pageUrl) {
        const enriched = await fetchPageContent(sourceUrl);
        if (enriched.title && enriched.title.length > title.length) {
          title = enriched.title.slice(0, 500);
        }
        if (enriched.description && !summary) {
          summary = enriched.description.slice(0, 800);
        }
      }

      if (webResearchAttempted < MAX_WEB_RESEARCH_PER_LINK) {
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
          if (research.citations[0]) {
            sourceUrl = research.citations[0].url;
          }
          if (research.summary) {
            summary = summary
              ? `${summary}\n\nWeb research: ${research.summary}`.slice(0, 3000)
              : research.summary.slice(0, 3000);
          }
          sourceProposalsCreated += await proposeSourcesFromResearch(campaignId, research, {
            title,
            pageUrl,
          });
        }
      }

      const { relevanceScore, urgencyScore } = scoreOpportunity(opp);
      const eventStartsAt = parseEventDate(opp.eventDate);
      const externalId = `ask-benson-link-${batchId}-${i}-${slugify(title)}`;

      const row: NewContentItem = {
        campaignId,
        type: 'industry_insight',
        language: 'en',
        state: 'planned',
        topic: title.slice(0, 500),
        hook: documentTitle?.slice(0, 500) ?? 'Captured from Ask Benson link',
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
          ingest: 'ask_benson_link',
          opportunityCategory: opp.category ?? 'local_event',
          tags: opp.tags ?? [],
          askBensonCapture: {
            batchId,
            pageUrl,
            documentTitle,
            businessName: opp.businessName,
            extractionConfidence: opp.confidence ?? null,
            enrichedFromUrl: true,
            webResearch,
          },
        },
        rawPayload: {
          extracted: opp,
          documentTitle,
          pageUrl,
        },
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
  }

  const backfilled = await promotePendingAskBensonProposals(campaignId);

  return {
    documentTitle,
    extractedCount,
    created,
    updated,
    items,
    enrichmentsAttempted,
    webResearchAttempted,
    sourceProposalsCreated,
    scrapeSourcesRegistered: countRegisteredScrapeSources(registrationResults) + backfilled,
    sourceUrls: input.urls,
  };
}
