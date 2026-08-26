import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, type NewContentItem } from '../schema.js';
import { persistIngestedContentItemResult } from '../scanner/ingest-persist.js';
import {
  listingChildHasStableDetailUrl,
  resolveListingScrapeExternalId,
} from './container-child-persist.js';
import { researchOpportunity, searchWeb, type WebResearchResult } from '../web-research/index.js';
import {
  buildScrapeListingSearchOptions,
  confirmScrapeWebSearchReserved,
  releaseScrapeWebSearchReservation,
  reserveScrapeWebSearch,
} from './scrape-websearch-guardrails.js';
import {
  extractOpportunitiesFromPage,
  fetchPageContent,
  parseEventDate,
  sanitizeEventEndInstant,
  scoreOpportunity,
  slugify,
} from './listing-extract.js';
import { overlayListingShowtime } from './listing-showtime.js';
import { isOpccEventDetailUrl, overlayOpccDetailVisibleTime } from './opcc-visible-time.js';
import {
  classifyEditorialContainer,
  decomposeEditorialOpportunities,
  jsonLdEventsToOpportunities,
  mergeExtractedOpportunities,
  titlesMatch,
} from './editorial-container.js';
import { parseJsonLdPageGraph } from './jsonld-events.js';
import { resolveListingEventCategory } from './listing-event-category.js';

export type ScrapeListingItem = {
  contentItemId: string;
  title: string;
  location: string | null;
  eventStartsAt: string | null;
  relevanceScore: number;
  urgencyScore: number;
  outcome: 'created' | 'updated';
  sourceUrl: string | null;
};

export type ScrapeListingResult = {
  documentTitle: string | null;
  extractedCount: number;
  created: number;
  updated: number;
  items: ScrapeListingItem[];
  enrichmentsAttempted: number;
  webResearchAttempted: number;
};

export async function scrapeListingUrl(input: {
  listingUrl: string;
  campaignId: string;
  sourceId: string;
  ingest: string;
  userMessage?: string;
  webResearchLimit?: number;
  hookPrefix?: string;
  discountWatch?: boolean;
  defaultCategory?: string;
  scanRunId?: string;
}): Promise<ScrapeListingResult> {
  const webResearchLimit = input.webResearchLimit ?? 0;
  let created = 0;
  let updated = 0;
  let enrichmentsAttempted = 0;
  let webResearchAttempted = 0;
  const items: ScrapeListingItem[] = [];
  let extractedCount = 0;
  let documentTitle: string | null = null;

  const searchOpts = () =>
    buildScrapeListingSearchOptions({
      sourceId: input.sourceId,
      listingUrl: input.listingUrl,
      scanRunId: input.scanRunId,
    });

  async function runGuardedScrapeSearch(
    kind: 'page_fallback' | 'opportunity_enrich',
    run: () => Promise<WebResearchResult>,
    enrichKey?: string,
  ): Promise<WebResearchResult | null> {
    const reservation = reserveScrapeWebSearch({
      listingUrl: input.listingUrl,
      kind,
      enrichKey,
    });
    if (!reservation.allowed) {
      return null;
    }
    const research = await run();
    if (research.skipped) {
      releaseScrapeWebSearchReservation();
      return null;
    }
    confirmScrapeWebSearchReserved(reservation.dedupeKey, reservation.refreshWaveId);
    return research;
  }

  let page = await fetchPageContent(input.listingUrl);
  if (!page.ok || !page.text) {
    const research = await runGuardedScrapeSearch('page_fallback', () =>
      searchWeb(
        `Find events and opportunities from this page or organization: ${input.listingUrl}. ${input.userMessage ?? ''}`.trim(),
        'Find official event listings, dates, venue, and ticket links for Kansas City metro when relevant. Cite URLs. Under 250 words.',
        searchOpts(),
      ),
    );
    if (research) webResearchAttempted += 1;
    if (research?.ok && (research.summary || research.citations.length > 0)) {
      page = {
        ok: true,
        title: research.citations[0]?.title ?? input.listingUrl,
        description: research.summary?.slice(0, 500),
        text: [
          research.summary ?? '',
          ...research.citations.map((c) => `${c.title ?? 'source'}: ${c.url}`),
        ]
          .filter(Boolean)
          .join('\n'),
      };
    } else {
      return {
        documentTitle,
        extractedCount,
        created,
        updated,
        items,
        enrichmentsAttempted,
        webResearchAttempted,
      };
    }
  }

  if (!page.text) {
    return {
      documentTitle,
      extractedCount,
      created,
      updated,
      items,
      enrichmentsAttempted,
      webResearchAttempted,
    };
  }

  const jsonLdGraph = parseJsonLdPageGraph(page.html ?? page.text);
  const preContainer = classifyEditorialContainer({
    url: input.listingUrl,
    title: page.title,
    pageText: page.text,
    jsonLdEvents: jsonLdGraph.events,
    hasArticleSchema: jsonLdGraph.hasArticleSchema,
  });
  const extraction = await extractOpportunitiesFromPage({
    pageUrl: input.listingUrl,
    pageTitle: page.title,
    pageDescription: page.description,
    pageText: page.text,
    pageHtml: page.html,
    userMessage: input.userMessage,
    discountWatch: input.discountWatch,
    editorialContainer: preContainer.isContainer,
  });

  documentTitle = extraction.documentTitle ?? page.title ?? documentTitle;
  if (jsonLdGraph.events.length > 0 && extraction.opportunities.length < 2) {
    extraction.opportunities = mergeExtractedOpportunities(
      extraction.opportunities,
      jsonLdEventsToOpportunities(jsonLdGraph.events, input.listingUrl),
    );
  }
  if (isOpccEventDetailUrl(input.listingUrl)) {
    extraction.opportunities = extraction.opportunities.map((opp) =>
      overlayOpccDetailVisibleTime(opp, {
        html: page.html,
        text: page.text,
        pageUrl: input.listingUrl,
      }),
    );
  }
  const container = classifyEditorialContainer({
    url: input.listingUrl,
    title: documentTitle,
    pageText: page.text,
    jsonLdEvents: jsonLdGraph.events,
    extractedTitles: extraction.opportunities.map((opp) => opp.title),
    hasArticleSchema: jsonLdGraph.hasArticleSchema,
  });
  if (container.isContainer) {
    extraction.opportunities = decomposeEditorialOpportunities({
      opportunities: extraction.opportunities,
      parentTitle: documentTitle,
      parentUrl: input.listingUrl,
      container,
    });
  }
  extractedCount = extraction.opportunities.length;
  const batchId = createHash('sha256').update(input.listingUrl).digest('hex').slice(0, 16);
  const hookPrefix = input.hookPrefix ?? (input.discountWatch ? 'Discount watch' : 'Captured listing scrape');
  const defaultCategory = input.defaultCategory ?? (input.discountWatch ? 'luxury_deal' : 'local_event');

  for (let i = 0; i < extraction.opportunities.length; i++) {
    let opp = extraction.opportunities[i]!;
    let summary = opp.summary?.trim() || page.description?.trim() || null;
    let title = opp.title.trim();
    let sourceUrl = opp.sourceUrl?.trim() || input.listingUrl;

    enrichmentsAttempted += 1;
    if (sourceUrl !== input.listingUrl) {
      const enriched = await fetchPageContent(sourceUrl);
      if (enriched.title && enriched.title.length > title.length) {
        title = enriched.title.slice(0, 500);
      }
      if (enriched.description && !summary) {
        summary = enriched.description.slice(0, 800);
      }
      if (enriched.ok) {
        opp = overlayListingShowtime(opp, {
          title: enriched.title ?? title,
          html: enriched.html,
          text: enriched.text,
        });
        if (isOpccEventDetailUrl(sourceUrl)) {
          opp = overlayOpccDetailVisibleTime(opp, {
            html: enriched.html,
            text: enriched.text,
            pageUrl: sourceUrl,
          });
        }
      }
    }

    if (webResearchAttempted < webResearchLimit) {
      const enrichKey = slugify(title);
      const research = await runGuardedScrapeSearch(
        'opportunity_enrich',
        () =>
          researchOpportunity(
            {
              title,
              location: opp.location ?? opp.venue,
              businessName: opp.businessName,
            },
            searchOpts(),
          ),
        enrichKey,
      );
      if (research) webResearchAttempted += 1;
      if (research?.ok && research.summary) {
        summary = summary
          ? `${summary}\n\nWeb research: ${research.summary}`.slice(0, 3000)
          : research.summary.slice(0, 3000);
        if (research.citations[0]) {
          sourceUrl = research.citations[0].url;
        }
      }
    }

    const { relevanceScore, urgencyScore } = scoreOpportunity(opp);
    const category = input.discountWatch
      ? (opp.category ?? defaultCategory)
      : resolveListingEventCategory({
          title,
          description: summary,
          sourceCategory: opp.category,
          tags: opp.tags,
          venueName: opp.venue,
        }).category;
    const isParentContainerRow =
      container.isContainer &&
      !container.parentRepresentsSingleEvent &&
      titlesMatch(title, documentTitle);
    const isContainerChild =
      container.isContainer && !container.parentRepresentsSingleEvent && !isParentContainerRow;
    // Durable identity is occurrence evidence, never extraction/card index `i`.
    const useListingChildIdentity = !input.discountWatch && !isParentContainerRow;
    const externalId = input.discountWatch
      ? `dw-${createHash('sha256').update(`${slugify(title)}|${sourceUrl}`).digest('hex').slice(0, 20)}`
      : resolveListingScrapeExternalId({
          ingest: input.ingest,
          listingUrl: input.listingUrl,
          title,
          eventDate: opp.eventDate,
          venue: opp.venue ?? opp.location,
          isParentContainerRow,
        });
    const row: NewContentItem = {
      campaignId: input.campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: title.slice(0, 500),
      hook: documentTitle?.slice(0, 500) ?? hookPrefix,
      script: summary?.slice(0, 4000) ?? null,
      sourceId: input.sourceId,
      sourceExternalId: externalId,
      sourceUrl,
      discoveredAt: new Date(),
      eventStartsAt: isParentContainerRow ? null : parseEventDate(opp.eventDate),
      eventEndsAt: isParentContainerRow
        ? null
        : sanitizeEventEndInstant(parseEventDate(opp.eventDate), parseEventDate(opp.eventEndDate)),
      locationName: opp.location?.trim() || opp.venue?.trim() || null,
      relevanceScore: String(relevanceScore),
      urgencyScore: String(urgencyScore),
      metadata: {
        ingest: input.discountWatch ? 'discount_watch' : input.ingest,
        opportunityCategory: category,
        tags: opp.tags ?? [],
        luxuryFlag: input.discountWatch || category.includes('luxury') || category.includes('spa') || category.includes('hotel'),
        listingSourceUrl: input.listingUrl,
        parentArticleUrl: opp.parentArticleUrl ?? input.listingUrl,
        editorialContainer: isParentContainerRow || undefined,
        containerChild: isContainerChild || undefined,
        calendarEligible: !isParentContainerRow && Boolean(opp.eventDate),
        listingScrape: {
          batchId,
          listingUrl: input.listingUrl,
          documentTitle,
          businessName: opp.businessName,
          extractionConfidence: opp.confidence ?? null,
        },
        discountWatch: input.discountWatch
          ? {
              listingUrl: input.listingUrl,
              merchant: opp.businessName ?? documentTitle,
            }
          : undefined,
      },
      rawPayload: {
        extracted: opp,
        documentTitle,
        listingUrl: input.listingUrl,
      },
    };

    const childMatchEventDate = opp.eventDate?.trim() || null;
    const urlHit =
      useListingChildIdentity && listingChildHasStableDetailUrl(input.listingUrl, sourceUrl)
        ? await db.query.contentItems.findFirst({
            where: and(eq(contentItems.sourceId, input.sourceId), eq(contentItems.sourceUrl, sourceUrl)),
            columns: { id: true },
          })
        : null;
    const persistResult = urlHit
      ? { outcome: 'updated' as const, contentItemId: urlHit.id }
      : await persistIngestedContentItemResult(input.sourceId, externalId, () => row, {
          sourceUrl,
          sharedHubProvenance: useListingChildIdentity,
          childMatch: useListingChildIdentity
            ? {
                title,
                eventStartsAt: parseEventDate(opp.eventDate),
                eventDate: childMatchEventDate,
                venue: opp.location?.trim() || opp.venue?.trim() || null,
                listingUrl: input.listingUrl,
              }
            : undefined,
        });
    const outcome = persistResult.outcome;

    if (outcome === 'updated' && persistResult.contentItemId && !isParentContainerRow) {
      const eventStartsAt = parseEventDate(opp.eventDate);
      await db
        .update(contentItems)
        .set({
          eventStartsAt,
          eventEndsAt: sanitizeEventEndInstant(eventStartsAt, parseEventDate(opp.eventEndDate)),
          rawPayload: {
            extracted: opp,
            documentTitle,
            listingUrl: input.listingUrl,
          },
        })
        .where(eq(contentItems.id, persistResult.contentItemId));
    }

    if (input.discountWatch && outcome === 'created') {
      const baseMeta = row.metadata as Record<string, unknown>;
      const dwMeta = (baseMeta.discountWatch ?? {}) as Record<string, unknown>;
      await db
        .update(contentItems)
        .set({
          metadata: {
            ...baseMeta,
            newDeal: true,
            discountWatch: {
              ...dwMeta,
              newDeal: true,
              firstSeenAt: new Date().toISOString(),
            },
          },
        })
        .where(
          and(
            eq(contentItems.sourceId, input.sourceId),
            eq(contentItems.sourceExternalId, externalId),
          ),
        );
    }

    const saved = persistResult.contentItemId
      ? await db.query.contentItems.findFirst({
          where: eq(contentItems.id, persistResult.contentItemId),
        })
      : null;
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

  return {
    documentTitle,
    extractedCount,
    created,
    updated,
    items,
    enrichmentsAttempted,
    webResearchAttempted,
  };
}
