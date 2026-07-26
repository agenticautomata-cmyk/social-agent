import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, type NewContentItem } from '../schema.js';
import { persistIngestedContentItem } from '../scanner/ingest-persist.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { researchOpportunity, searchWeb, type WebResearchResult } from '../web-research/index.js';
import {
  extractOpportunitiesFromPage,
  parseEventDate,
  scoreOpportunity,
  slugify,
} from './listing-extract.js';
import {
  fetchUrlWithPipeline,
  type UrlIntakeDiagnostics,
} from './url-intake-pipeline.js';
import {
  detectLocationsInText,
  isMapSearchUrl,
  qualifyUrlOpportunity,
  resolveEntityFromUrl,
  type ResolvedUrlEntity,
} from './qualify-url-opportunity.js';
import { extractLocationScopeFromMessage } from './url-geo.js';
import {
  loadWatchRuleForDomain,
  quarantineWrongLocationItems,
  recordQuarantine,
  upsertWatchRule,
} from './url-intake-store.js';
import type { UrlIntakeSummary } from './url-intake-answer.js';
import {
  buildEntityExternalId,
  buildEntityOpportunityActions,
  buildEntityOpportunityRow,
  inferBusinessName,
  inferEntityLocation,
  inferOpportunityType,
  qualifyEntityFromUrl,
  resolveIntakeOutcome,
  type UrlIntakeOutcome,
} from './url-entity-opportunity.js';
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
  urlIntakeDiagnostics?: UrlIntakeDiagnostics[];
  urlIntakeSummary?: UrlIntakeSummary;
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
  const urlIntakeDiagnostics: UrlIntakeDiagnostics[] = [];
  let qualifiedCount = 0;
  let quarantinedCount = 0;
  const quarantineReasons: string[] = [];
  const savedTitles: string[] = [];
  let entity: ResolvedUrlEntity | null = null;
  let locationScope: string | null = null;
  let watchRuleSaved = false;
  let needsLocationConfirmation = false;
  const identifiedLocations: string[] = [];
  let entityOpportunityId: string | null = null;
  let entityOpportunityTitle: string | null = null;
  let entityOpportunityType: string | null = null;
  let entityCreated = false;
  let entityUpdated = false;
  let qualificationOutcome: UrlIntakeOutcome | undefined;
  let opportunityActions: UrlIntakeSummary['opportunityActions'];

  for (const pageUrl of input.urls) {
    entity = resolveEntityFromUrl(pageUrl);
    const messageScope = input.userMessage ? extractLocationScopeFromMessage(input.userMessage) : null;
    const existingRule = await loadWatchRuleForDomain(entity.domain);
    locationScope = messageScope ?? existingRule?.locationScope ?? null;

    if (messageScope) {
      await upsertWatchRule({
        domain: entity.domain,
        businessName: entity.businessName,
        locationScope: messageScope,
      });
      watchRuleSaved = true;
      await quarantineWrongLocationItems({ entityDomain: entity.domain, locationScope: messageScope });
    }

    let page = await fetchUrlWithPipeline(pageUrl);
    urlIntakeDiagnostics.push(page.diagnostics);

    if (!page.ok || !page.text) {
      webResearchAttempted += 1;
      page.diagnostics.webSearchFallback = true;
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
          diagnostics: {
            ...page.diagnostics,
            webSearchFallback: true,
            methodsAttempted: [...page.diagnostics.methodsAttempted, 'web_search'],
            summary: `${page.diagnostics.summary} Web search fallback supplied ${(research.summary ?? '').length} chars.`,
          },
        };
        urlIntakeDiagnostics[urlIntakeDiagnostics.length - 1] = page.diagnostics;
      } else {
        continue;
      }
    }

    if (!page.text) continue;

    entity = resolveEntityFromUrl(pageUrl, page.title);
    const pageLocations = detectLocationsInText(page.text);
    identifiedLocations.push(...pageLocations);
    if (pageLocations.length > 1 && !locationScope) {
      entity = { ...entity, locations: pageLocations, multiLocation: true };
      needsLocationConfirmation = true;
    }

    const extraction = await extractOpportunitiesFromPage({
      pageUrl,
      pageTitle: page.title,
      pageDescription: page.description,
      pageText: page.text,
      userMessage: input.userMessage,
    });

    documentTitle = extraction.documentTitle ?? page.title ?? documentTitle;
    extractedCount += extraction.opportunities.length;

    const businessName = inferBusinessName({
      pageTitle: page.title,
      pageText: page.text,
      domain: entity.domain,
      entity,
    });
    entity = { ...entity, businessName };
    const entityLocation = inferEntityLocation({
      locationScope,
      pageText: page.text,
      identifiedLocations: pageLocations,
    });
    entityOpportunityType = inferOpportunityType(page.text, businessName);

    const entityQualification = qualifyEntityFromUrl({
      pageUrl,
      pageText: page.text,
      entity,
      locationScope,
      needsLocationConfirmation,
      businessName,
    });

    const entityExternalId = buildEntityExternalId(entity.domain, locationScope);
    let entityPersisted = false;

    if (entityQualification.accepted) {
      const entityRow = buildEntityOpportunityRow({
        campaignId,
        sourceId,
        pageUrl,
        pageDescription: page.description,
        businessName,
        locationName: entityLocation,
        locationScope,
        opportunityType: entityOpportunityType,
        entity,
        userMessage: input.userMessage,
        outcome: 'ENTITY_ACCEPTED_NO_CURRENT_CLAIMS',
        externalId: entityExternalId,
      });

      const entityOutcome = await persistIngestedContentItem(sourceId, entityExternalId, () => entityRow, {
        sourceUrl: pageUrl,
      });

      const savedEntity = await db.query.contentItems.findFirst({
        where: eq(contentItems.sourceExternalId, entityExternalId),
      });

      if (savedEntity) {
        entityPersisted = true;
        entityOpportunityId = savedEntity.id;
        entityOpportunityTitle = savedEntity.topic;
        const entityRowOutcome: 'created' | 'updated' =
          entityOutcome === 'created' ? 'created' : 'updated';
        if (entityOutcome === 'created') {
          created += 1;
          entityCreated = true;
        } else if (entityOutcome === 'updated') {
          updated += 1;
          entityUpdated = true;
        }
        items.push({
          contentItemId: savedEntity.id,
          title: savedEntity.topic,
          location: savedEntity.locationName,
          eventStartsAt: null,
          relevanceScore: Number(savedEntity.relevanceScore ?? 0.62),
          urgencyScore: Number(savedEntity.urgencyScore ?? 0.35),
          outcome: entityRowOutcome,
          sourceUrl: savedEntity.sourceUrl,
        });
        savedTitles.unshift(savedEntity.topic);
        opportunityActions = buildEntityOpportunityActions(savedEntity.id, pageUrl);
      }
    }

    const batchId = createHash('sha256').update(pageUrl).digest('hex').slice(0, 16);
    let pageQualified = 0;
    let pageQuarantined = 0;

    for (let i = 0; i < extraction.opportunities.length; i++) {
      const opp = extraction.opportunities[i]!;
      let summary = opp.summary?.trim() || page.description?.trim() || null;
      let title = opp.title.trim();
      let sourceUrl = opp.sourceUrl?.trim() || pageUrl;
      let webResearch: { summary: string | null; links: string[] } | null = null;

      const qualification = qualifyUrlOpportunity({
        opp,
        pageUrl,
        sourceUrl,
        entity,
        locationScope,
        pageText: page.text,
      });

      if (!qualification.qualified) {
        quarantinedCount += 1;
        pageQuarantined += 1;
        quarantineReasons.push(qualification.rejectionReason ?? qualification.rejectionCode ?? 'rejected');
        await recordQuarantine({
          sourceUrl,
          pageUrl,
          userMessage: input.userMessage,
          opp,
          rejectionCode: qualification.rejectionCode!,
          rejectionReason: qualification.rejectionReason ?? 'Qualification failed',
          entityName: entity.businessName,
          entityDomain: entity.domain,
          locationScope,
        });
        continue;
      }

      enrichmentsAttempted += 1;
      if (sourceUrl !== pageUrl && !isMapSearchUrl(sourceUrl)) {
        const enriched = await fetchUrlWithPipeline(sourceUrl);
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
          const officialCitation = research.citations.find((c) => !isMapSearchUrl(c.url));
          if (officialCitation) {
            sourceUrl = officialCitation.url;
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
        sourceUrl: isMapSearchUrl(sourceUrl) ? pageUrl : sourceUrl,
        discoveredAt: new Date(),
        eventStartsAt,
        eventEndsAt: parseEventDate(opp.eventEndDate),
        locationName: opp.location?.trim() || opp.venue?.trim() || null,
        relevanceScore: String(relevanceScore),
        urgencyScore: String(urgencyScore),
        creatorValueStatus: 'creator_candidate',
        metadata: {
          ingest: 'ask_benson_link',
          opportunityLayer: 'claim',
          linkedEntityExternalId: entityPersisted ? entityExternalId : null,
          linkedEntityContentItemId: entityOpportunityId,
          opportunityCategory: opp.category ?? 'local_event',
          tags: opp.tags ?? [],
          qualificationPassed: true,
          locationScope: locationScope ?? null,
          askBensonCapture: {
            batchId,
            pageUrl,
            documentTitle,
            businessName: opp.businessName ?? entity.businessName,
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
      savedTitles.push(saved.topic);
      pageQualified += 1;
      qualifiedCount += 1;
    }

    qualificationOutcome = resolveIntakeOutcome({
      entityAccepted: entityPersisted,
      pendingLocation: Boolean(entityQualification.pendingLocation),
      qualifiedClaimCount: pageQualified,
      quarantinedClaimCount: pageQuarantined,
      extractedClaimCount: extraction.opportunities.length,
    });

    if (!entityPersisted && entityQualification.pendingLocation) {
      qualificationOutcome = 'ENTITY_PENDING_LOCATION';
    }

    if (entityPersisted && entityOpportunityId) {
      const [existingEntity] = await db
        .select({ metadata: contentItems.metadata })
        .from(contentItems)
        .where(eq(contentItems.id, entityOpportunityId))
        .limit(1);
      const metadata = (existingEntity?.metadata ?? {}) as Record<string, unknown>;
      await db
        .update(contentItems)
        .set({
          metadata: {
            ...metadata,
            qualificationOutcome,
          },
        })
        .where(eq(contentItems.id, entityOpportunityId));
    }

    if (entityPersisted || pageQualified >= 1) {
      const registered = await registerAskBensonListingUrl({
        campaignId,
        url: pageUrl,
        title: documentTitle ?? businessName,
        rationale: entityPersisted
          ? 'User-submitted entity opportunity — recurring scrape for branch updates.'
          : 'Qualified URL intake — recurring scrape after qualification passed.',
        metadata: { discoveredVia: 'ask_benson_link_page', locationScope, entityLayer: entityPersisted },
      });
      registrationResults.push(registered);
      if (registered.ok) sourceProposalsCreated += 1;
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
    urlIntakeDiagnostics,
    urlIntakeSummary: {
      entity,
      locationScope,
      watchRuleSaved,
      qualifiedCount,
      quarantinedCount,
      quarantineReasons: [...new Set(quarantineReasons)].slice(0, 5),
      needsLocationConfirmation,
      identifiedLocations: [...new Set(identifiedLocations)],
      savedTitles,
      diagnostics: urlIntakeDiagnostics,
      qualificationOutcome,
      entityOpportunityId,
      entityOpportunityTitle,
      entityOpportunityType,
      entityCreated,
      entityUpdated,
      opportunityActions,
      calendarItemsCreated: 0,
    },
  };
}
