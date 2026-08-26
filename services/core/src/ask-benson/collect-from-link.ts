import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, type NewContentItem } from '../schema.js';
import { persistIngestedContentItem, persistIngestedContentItemResult } from '../scanner/ingest-persist.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { researchOpportunity, searchWeb, type WebResearchResult } from '../web-research/index.js';
import {
  extractOpportunitiesFromPage,
  parseEventDate,
  sanitizeEventEndInstant,
  scoreOpportunity,
  slugify,
  applyListingProvenance,
} from './listing-extract.js';
import {
  isEditorialRoundupSource,
  isStaleEditorialRoundup,
  extractRoundupYear,
} from './editorial-roundup.js';
import {
  classifyEditorialContainer,
  decomposeEditorialOpportunities,
  jsonLdEventsToOpportunities,
  mergeExtractedOpportunities,
  titlesMatch,
} from './editorial-container.js';
import { parseJsonLdPageGraph } from './jsonld-events.js';
import { isOpccEventDetailUrl, overlayOpccDetailVisibleTime } from './opcc-visible-time.js';
import { resolveListingEventCategory } from './listing-event-category.js';
import { computeLifecycleStatus } from '../creator-agent/lifecycle.js';
import {
  fetchUrlWithPipeline,
  type UrlIntakeDiagnostics,
} from './url-intake-pipeline.js';
import { instagramHandleFromUrl, isInstagramUrl } from './instagram-intake.js';
import {
  classifyStandaloneUrlType,
  extractLinkHubDestinations,
  hubOwnerFromPath,
  isKnownSocialOrLinkHubUrl,
  type StandaloneUrlType,
} from './url-type.js';
import {
  detectLocationsInText,
  isMapSearchUrl,
  isPastEventDate,
  qualifyUrlOpportunity,
  resolveEntityFromUrl,
  type ResolvedUrlEntity,
} from './qualify-url-opportunity.js';
import { extractLocationScopeFromMessage } from './url-geo.js';
import { isDirectoryListingContent, isDirectoryListingIntake, isExplicitUserAddOpportunityRequest } from './intake-intents.js';
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
  hasUsableExtractedContent,
  inferBusinessName,
  inferEntityLocation,
  inferOpportunityType,
  formatOpportunityTypeLabel,
  qualifyEntityFromUrl,
  resolveIntakeOutcome,
  userExplicitlyAskedToResearchUrl,
  type UrlIntakeOutcome,
} from './url-entity-opportunity.js';
import {
  buildUserOpportunityExternalId,
  extractEventbriteEventId,
  findMatchingUserOpportunity,
  isDirectEventListingUrl,
  isEventListingSourcePage,
  listingSourceLabel,
  normalizeCanonicalEventUrl,
} from './url-intake-dedupe.js';
import {
  buildFallbackEventOpportunity,
  isTicketVendorUrl,
  officialEventCategory,
  officialOccurrenceTitle,
  scoreEventOccurrenceSignals,
} from './event-occurrence.js';
import { persistUserConfirmedOpportunity } from './user-opportunity-save.js';
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

function isInstagramEventRoundup(
  pageUrl: string,
  pageText: string,
  diagnostics?: UrlIntakeDiagnostics,
): boolean {
  if (!isInstagramUrl(pageUrl)) return false;
  if (/Slide \d+ text:/i.test(pageText)) return true;
  if (diagnostics?.ocrOk && diagnostics.methodsAttempted.includes('ocr_vision')) return true;
  return false;
}

function urlTypeIntakeOutcome(urlType: StandaloneUrlType): UrlIntakeOutcome | null {
  if (urlType === 'social_post') return 'SOCIAL_POST_INTAKE';
  if (urlType === 'social_profile') return 'SOCIAL_PROFILE_SOURCE';
  if (urlType === 'link_hub') return 'LINK_HUB_INTAKE';
  return null;
}

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

function existingSupportsCurrentValue(match: { eventStartsAt: Date | null }): boolean {
  if (match.eventStartsAt && isPastEventDate(match.eventStartsAt)) return false;
  return true;
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
  let instagramRoundup = false;
  let instagramHandle: string | null = null;
  let directoryListing = false;
  let eventListing = false;
  let officialEventOccurrence = false;
  let editorialRoundup = false;
  let staleEditorialRoundup = false;
  let retainedQuietlyCount = 0;
  const extractedTitles: string[] = [];
  let enrichmentFailures = 0;
  let userConfirmedSave = false;
  let primaryOpportunityId: string | null = null;
  let hubOwner: string | null = null;
  let hubDestinations: UrlIntakeSummary['hubDestinations'];

  const explicitUserAdd = isExplicitUserAddOpportunityRequest(input.userMessage);

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
    const urlType = classifyStandaloneUrlType(pageUrl);
    const typedOutcome = urlTypeIntakeOutcome(urlType);

    // Zero-content / failed fetch must not authorize entity creation. Do not invent an
    // entity from unrelated web-search titles unless the operator explicitly asks to research.
    if (!page.ok || !hasUsableExtractedContent(page.text)) {
      if (typedOutcome) {
        page.diagnostics.webSearchFallback = false;
        page.diagnostics.summary =
          page.diagnostics.summary ||
          `Recognized ${urlType.replace(/_/g, ' ')} URL but could not extract usable page content.`;
        if (!page.diagnostics.nextAction) {
          page.diagnostics.nextAction =
            urlType === 'social_profile'
              ? 'Keep as a source or inspect supported profile information.'
              : urlType === 'social_post'
                ? 'Retry the post, keep it as a source, or share a screenshot.'
                : 'Retry this link hub, or share a destination URL from the page.';
        }
        urlIntakeDiagnostics[urlIntakeDiagnostics.length - 1] = page.diagnostics;
        qualificationOutcome = typedOutcome;
        instagramHandle = instagramHandleFromUrl(pageUrl);
        if (urlType === 'link_hub') hubOwner = hubOwnerFromPath(pageUrl);
        continue;
      }
      const allowResearchFallback = userExplicitlyAskedToResearchUrl(input.userMessage);
      if (!allowResearchFallback) {
        const zeroChars = page.diagnostics.fetchOk && page.diagnostics.textLength === 0;
        page.diagnostics.webSearchFallback = false;
        page.diagnostics.summary = zeroChars
          ? `Opened ${page.diagnostics.domain} (HTTP ${page.diagnostics.httpStatus ?? 200}) but extracted 0 usable characters of page content.`
          : page.diagnostics.summary ||
            `Could not extract usable content from ${page.diagnostics.domain}.`;
        page.diagnostics.nextAction =
          'Retry this URL, keep it as a source, or ask me to research it.';
        urlIntakeDiagnostics[urlIntakeDiagnostics.length - 1] = page.diagnostics;
        qualificationOutcome = 'NO_SUPPORTED_ENTITY';
        // Soft-isolate: a new standalone URL is message-level context; do not mutate
        // durable inventory from empty evidence or prior conversation entity hints.
        continue;
      }

      webResearchAttempted += 1;
      page.diagnostics.webSearchFallback = true;
      // An Instagram shortcode is opaque to search engines; query the handle instead.
      const igHandle = isInstagramUrl(pageUrl) ? instagramHandleFromUrl(pageUrl) : null;
      const researchSubject = igHandle
        ? `the Kansas City business or creator behind the Instagram account @${igHandle}`
        : `this page or organization: ${pageUrl}`;
      const research = await searchWeb(
        `Find events and opportunities from ${researchSubject}. ${input.userMessage ?? ''}`.trim(),
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
        qualificationOutcome = 'NO_SUPPORTED_ENTITY';
        continue;
      }
    }

    if (!hasUsableExtractedContent(page.text)) {
      qualificationOutcome = typedOutcome ?? 'NO_SUPPORTED_ENTITY';
      continue;
    }

    if (urlType === 'social_profile') {
      instagramHandle = instagramHandleFromUrl(pageUrl);
      qualificationOutcome = 'SOCIAL_PROFILE_SOURCE';
      documentTitle = page.title ?? (instagramHandle ? `@${instagramHandle}` : documentTitle);
      continue;
    }

    if (urlType === 'link_hub') {
      hubOwner = hubOwnerFromPath(pageUrl);
      hubDestinations = extractLinkHubDestinations({
        hubUrl: pageUrl,
        pageText: page.text,
      });
      qualificationOutcome = 'LINK_HUB_INTAKE';
      documentTitle = page.title ?? hubOwner ?? documentTitle;
      continue;
    }

    directoryListing =
      isDirectoryListingIntake(input.userMessage) ||
      isDirectoryListingContent(page.text, page.title ?? page.description);

    instagramRoundup = isInstagramEventRoundup(pageUrl, page.text, page.diagnostics);
    instagramHandle =
      instagramHandleFromUrl(pageUrl) ??
      page.text.match(/Instagram post by @([\w.]+)/i)?.[1] ??
      null;

    entity = resolveEntityFromUrl(pageUrl, page.title);
    const pageLocations = detectLocationsInText(page.text);
    identifiedLocations.push(...pageLocations);
    const eventListingSource = isEventListingSourcePage(pageUrl, page.text ?? '', page.title);
    const pageEditorial = isEditorialRoundupSource(pageUrl, page.title, page.text);
    const pageStaleEditorial = isStaleEditorialRoundup(pageUrl, page.title);
    if (pageEditorial) editorialRoundup = true;
    if (pageStaleEditorial) staleEditorialRoundup = true;
    if (eventListingSource || pageEditorial) eventListing = true;

    if (instagramRoundup) {
      locationScope = locationScope ?? 'Kansas City';
      needsLocationConfirmation = false;
      entity = {
        ...entity,
        businessName: instagramHandle ? `@${instagramHandle}` : entity.businessName,
        locations: ['Kansas City'],
        multiLocation: false,
      };
    } else if (eventListingSource) {
      // A calendar/listing is message-level source context, not a multi-location entity chooser.
      needsLocationConfirmation = false;
    } else if (pageLocations.length > 1 && !locationScope) {
      entity = { ...entity, locations: pageLocations, multiLocation: true };
      needsLocationConfirmation = true;
    }

    const jsonLdGraph = parseJsonLdPageGraph(page.text);
    const preContainer = classifyEditorialContainer({
      url: pageUrl,
      title: page.title,
      pageText: page.text,
      jsonLdEvents: jsonLdGraph.events,
      hasArticleSchema: jsonLdGraph.hasArticleSchema,
    });
    const extraction = await extractOpportunitiesFromPage({
      pageUrl,
      pageTitle: page.title,
      pageDescription: page.description,
      pageText: page.text ?? '',
      userMessage: input.userMessage,
      directoryListing,
      editorialContainer: preContainer.isContainer,
    });

    documentTitle = extraction.documentTitle ?? page.title ?? documentTitle;
    extractedCount += extraction.opportunities.length;
    for (const opp of extraction.opportunities) {
      if (opp.title?.trim()) extractedTitles.push(opp.title.trim());
    }

    const businessName = inferBusinessName({
      pageTitle: page.title,
      pageText: page.text,
      domain: entity.domain,
      entity,
      sourceUrl: pageUrl,
    });
    entity = { ...entity, businessName };
    const entityLocation = inferEntityLocation({
      locationScope,
      pageText: page.text,
      identifiedLocations: pageLocations,
    });
    const occurrenceSignals = scoreEventOccurrenceSignals({
      pageUrl,
      pageTitle: page.title,
      pageText: page.text,
      businessName,
    });
    officialEventOccurrence = occurrenceSignals.isEventOccurrence;
    entityOpportunityType =
      urlType === 'social_post'
        ? null
        : officialEventOccurrence
          ? /\bfest(?:ival)?\b/i.test(`${page.title ?? ''} ${page.text} ${businessName}`)
            ? 'festival_event'
            : 'local_event'
          : inferOpportunityType(page.text, businessName);

    const container = classifyEditorialContainer({
      url: pageUrl,
      title: page.title ?? extraction.documentTitle,
      pageText: page.text,
      jsonLdEvents: jsonLdGraph.events,
      extractedTitles: extraction.opportunities.map((opp) => opp.title),
      hasArticleSchema: jsonLdGraph.hasArticleSchema,
    });
    if (container.isContainer && !container.parentRepresentsSingleEvent) {
      officialEventOccurrence = false;
      editorialRoundup = true;
      eventListing = true;
    }

    if (jsonLdGraph.events.length > 0 && extraction.opportunities.length < 2) {
      extraction.opportunities = mergeExtractedOpportunities(
        extraction.opportunities,
        jsonLdEventsToOpportunities(jsonLdGraph.events, pageUrl, entity.domain),
      );
    }
    if (isOpccEventDetailUrl(pageUrl)) {
      extraction.opportunities = extraction.opportunities.map((opp) =>
        overlayOpccDetailVisibleTime(opp, {
          text: page.text,
          pageUrl,
        }),
      );
    }

    if (container.isContainer) {
      extraction.opportunities = decomposeEditorialOpportunities({
        opportunities: extraction.opportunities,
        parentTitle: page.title ?? extraction.documentTitle,
        parentUrl: pageUrl,
        publisher: entity.domain,
        container,
      });
    }

    extractedCount = extraction.opportunities.length;
    extractedTitles.length = 0;
    for (const opp of extraction.opportunities) {
      if (opp.title?.trim()) extractedTitles.push(opp.title.trim());
    }

    if (officialEventOccurrence && !container.isContainer) {
      const officialOpp = buildFallbackEventOpportunity({
        pageUrl,
        pageTitle: page.title ?? extraction.documentTitle,
        pageText: page.text,
        businessName,
      });
      if (officialOpp) {
        extraction.opportunities = [officialOpp];
        extractedCount = 1;
        extractedTitles.length = 0;
        extractedTitles.push(officialOpp.title);
      } else if (extraction.opportunities.length > 1) {
        extraction.opportunities = [extraction.opportunities[0]!];
        extractedCount = 1;
        extractedTitles.length = 0;
        extractedTitles.push(extraction.opportunities[0]!.title);
      }
    }

    if (explicitUserAdd && extraction.opportunities.length === 0) {
      const fallbackTitle = (page.title ?? extraction.documentTitle ?? documentTitle ?? '').trim();
      if (fallbackTitle) {
        extraction.opportunities.push({
          title: fallbackTitle,
          summary: page.description?.trim() || null,
          location: entityLocation,
          venue: null,
          businessName,
          eventDate: null,
          eventEndDate: null,
          category: 'local_event',
          sourceUrl: pageUrl,
          tags: [],
          confidence: 0.4,
        });
        extractedCount += 1;
        extractedTitles.push(fallbackTitle);
      }
    }

    const skipEntityLayer =
      urlType === 'social_post' ||
      isDirectEventListingUrl(pageUrl) ||
      eventListingSource ||
      officialEventOccurrence ||
      pageEditorial ||
      (explicitUserAdd && !directoryListing && !instagramRoundup);

    const entityQualification = qualifyEntityFromUrl({
      pageUrl,
      pageText: page.text,
      pageTitle: page.title,
      entity,
      locationScope,
      needsLocationConfirmation,
      businessName,
      fromWebSearchFallback: Boolean(page.diagnostics.webSearchFallback),
    });

    const entityExternalId = buildEntityExternalId(entity.domain, locationScope);
    let entityPersisted = false;

    if (!skipEntityLayer && entityQualification.accepted) {
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
    const listingVenueName =
      eventListingSource || pageEditorial
        ? listingSourceLabel(page.title ?? documentTitle, entity.domain)
        : officialEventOccurrence
          ? occurrenceSignals.venue
          : null;
    const listingLocation =
      (officialEventOccurrence ? occurrenceSignals.location : null) ||
      entityLocation ||
      (eventListingSource || pageEditorial || officialEventOccurrence
        ? locationScope || 'Kansas City'
        : null);

    for (let i = 0; i < extraction.opportunities.length; i++) {
      let opp = extraction.opportunities[i]!;
      if (eventListingSource || pageEditorial || officialEventOccurrence) {
        if (officialEventOccurrence) {
          if (!opp.eventDate && occurrenceSignals.startDate) {
            opp = {
              ...opp,
              eventDate: occurrenceSignals.startDate.toISOString().slice(0, 10),
              eventEndDate:
                opp.eventEndDate ??
                (occurrenceSignals.endDate
                  ? occurrenceSignals.endDate.toISOString().slice(0, 10)
                  : null),
            };
          } else if (!opp.eventEndDate && occurrenceSignals.endDate) {
            opp = {
              ...opp,
              eventEndDate: occurrenceSignals.endDate.toISOString().slice(0, 10),
            };
          }
          if (!opp.venue && occurrenceSignals.venue) {
            opp = { ...opp, venue: occurrenceSignals.venue };
          }
        }
        opp = applyListingProvenance(opp, {
          listingUrl: pageUrl,
          listingLocation,
          listingVenueName,
        });
        extraction.opportunities[i] = opp;
      }
      let summary = opp.summary?.trim() || page.description?.trim() || null;
      let title = officialEventOccurrence
        ? officialOccurrenceTitle({
            pageTitle: page.title ?? documentTitle,
            businessName,
            fallbackTitle: opp.title,
          }) ?? opp.title.trim()
        : opp.title.trim();
      let sourceUrl = officialEventOccurrence && !isTicketVendorUrl(pageUrl)
        ? pageUrl
        : opp.sourceUrl?.trim() || pageUrl;
      if (officialEventOccurrence && isTicketVendorUrl(sourceUrl)) sourceUrl = pageUrl;
      let webResearch: { summary: string | null; links: string[] } | null = null;
      let enrichmentFailed = false;

      const qualification = qualifyUrlOpportunity({
        opp,
        pageUrl,
        sourceUrl,
        entity,
        locationScope,
        pageText: page.text,
        directoryListing,
        eventListing: eventListingSource || pageEditorial || officialEventOccurrence,
        staleEditorialRoundup: pageStaleEditorial,
      });

      if (!qualification.qualified && !explicitUserAdd) {
        if (pageStaleEditorial && qualification.rejectionCode === 'past_event' && !parseEventDate(opp.eventDate)) {
          const existingEvergreen = await findMatchingUserOpportunity({
            sourceId,
            canonicalUrl: opp.sourceUrl?.trim() && opp.sourceUrl.trim() !== pageUrl
              ? normalizeCanonicalEventUrl(opp.sourceUrl)
              : null,
            title,
            eventDate: null,
            venue: opp.location?.trim() || opp.venue?.trim() || null,
          });
          if (existingEvergreen && existingSupportsCurrentValue(existingEvergreen)) {
            retainedQuietlyCount += 1;
            continue;
          }
        }
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

      const isParentContainerRow =
        container.isContainer &&
        !container.parentRepresentsSingleEvent &&
        titlesMatch(opp.title, page.title ?? extraction.documentTitle);
      const isContainerChild =
        container.isContainer && !container.parentRepresentsSingleEvent && !isParentContainerRow;
      const eventStartsAt = isParentContainerRow ? null : parseEventDate(opp.eventDate);
      const eventEndsAt = isParentContainerRow
        ? null
        : sanitizeEventEndInstant(eventStartsAt, parseEventDate(opp.eventEndDate));
      const eventSpecificUrl =
        officialEventOccurrence
          ? null
          : opp.sourceUrl?.trim() && opp.sourceUrl.trim() !== pageUrl
            ? normalizeCanonicalEventUrl(opp.sourceUrl)
            : null;
      const listingCanonical = normalizeCanonicalEventUrl(pageUrl);
      const canonicalUrl =
        officialEventOccurrence
          ? listingCanonical ?? normalizeCanonicalEventUrl(pageUrl)
          : eventSpecificUrl ?? listingCanonical ?? normalizeCanonicalEventUrl(sourceUrl);
      const eventbriteEventId =
        extractEventbriteEventId(pageUrl) ?? extractEventbriteEventId(sourceUrl) ?? extractEventbriteEventId(canonicalUrl);
      const stableListingId =
        eventListingSource ||
        pageEditorial ||
        officialEventOccurrence ||
        explicitUserAdd ||
        eventbriteEventId;
      const existingMatch = stableListingId
        ? await findMatchingUserOpportunity({
            sourceId,
            eventbriteEventId,
            canonicalUrl: isContainerChild
              ? eventSpecificUrl ?? `${listingCanonical ?? pageUrl}#${slugify(title)}`
              : eventSpecificUrl ?? canonicalUrl,
            title,
            eventDate: eventStartsAt,
            venue: opp.location?.trim() || opp.venue?.trim() || null,
          })
        : null;

      const { relevanceScore, urgencyScore } = scoreOpportunity(opp);
      const listingEventCategory =
        eventListingSource || pageEditorial || officialEventOccurrence
          ? resolveListingEventCategory({
              title,
              description: summary,
              sourceCategory: opp.category,
              tags: opp.tags,
              venueName: opp.venue ?? listingVenueName,
            }).category
          : null;
      const opportunityCategory =
        listingEventCategory ??
        (officialEventOccurrence
          ? officialEventCategory(occurrenceSignals, title)
          : null) ??
        opp.category ??
        (directoryListing ? 'local_business' : 'local_event');
      const externalId = stableListingId
        ? buildUserOpportunityExternalId({
            eventbriteEventId,
            canonicalUrl: eventSpecificUrl ?? `${listingCanonical ?? pageUrl}#${slugify(title)}`,
            title,
            eventDateIso: eventStartsAt?.toISOString() ?? null,
            venue: opp.venue?.trim() || opp.location?.trim() || null,
          })
        : `ask-benson-link-${batchId}-${i}-${slugify(title)}`;

      const baseRow: NewContentItem = {
        campaignId,
        type: 'industry_insight',
        language: 'en',
        state: 'planned',
        topic: title.slice(0, 500),
        hook: officialEventOccurrence
          ? formatOpportunityTypeLabel(entityOpportunityType ?? 'local_event')
          : documentTitle?.slice(0, 500) ?? 'Captured from Ask Benson link',
        script: summary?.slice(0, 4000) ?? null,
        sourceId,
        sourceExternalId: externalId,
        sourceUrl: eventSpecificUrl ?? (isMapSearchUrl(sourceUrl) ? pageUrl : sourceUrl),
        discoveredAt: new Date(),
        eventStartsAt,
        eventEndsAt,
        locationName: officialEventOccurrence
          ? occurrenceSignals.location || opp.location?.trim() || opp.venue?.trim() || null
          : opp.location?.trim() || opp.venue?.trim() || null,
        relevanceScore: String(relevanceScore),
        urgencyScore: String(urgencyScore),
        creatorValueStatus: 'creator_candidate',
        lifecycleStatus: computeLifecycleStatus({
          title,
          eventStartsAt,
          eventEndsAt,
          discoveredAt: new Date(),
          metadata: { opportunityCategory },
        }),
        metadata: {
          ingest: 'ask_benson_link',
          opportunityLayer: 'claim',
          linkedEntityExternalId: entityPersisted ? entityExternalId : null,
          linkedEntityContentItemId: entityOpportunityId,
          opportunityCategory,
          tags: opp.tags ?? [],
          qualificationPassed: qualification.qualified,
          qualificationBypassed: explicitUserAdd && !qualification.qualified,
          userConfirmed: explicitUserAdd,
          locationScope: locationScope ?? null,
          eventbriteEventId: eventbriteEventId ?? null,
          listingSourceUrl: pageUrl,
          parentArticleUrl: opp.parentArticleUrl ?? pageUrl,
          publisher: opp.publisher ?? entity.domain,
          editorialContainer: isParentContainerRow || undefined,
          containerChild: isContainerChild || undefined,
          calendarEligible: !isParentContainerRow && Boolean(eventStartsAt),
          canonicalEventUrl: canonicalUrl ?? null,
          officialEventOccurrence: officialEventOccurrence || undefined,
          qualificationOutcome: officialEventOccurrence
            ? 'OFFICIAL_EVENT_ACCEPTED'
            : undefined,
          ticketUrl: occurrenceSignals.ticketUrl ?? undefined,
          venue: officialEventOccurrence
            ? opp.venue ?? occurrenceSignals.venue ?? undefined
            : undefined,
          opportunityType: officialEventOccurrence
            ? entityOpportunityType ?? 'local_event'
            : undefined,
          userSubmission: explicitUserAdd
            ? {
                submittedByUser: true,
                submissionSource: 'ask_benson',
                submittedAt: new Date().toISOString(),
                submittedUrl: pageUrl,
                userIntent: input.userMessage ?? null,
                userConfirmed: true,
              }
            : undefined,
          askBensonCapture: {
            batchId,
            pageUrl,
            documentTitle,
            businessName: opp.businessName ?? entity.businessName,
            extractionConfidence: opp.confidence ?? null,
            enrichedFromUrl: false,
            webResearch: null,
          },
        },
        rawPayload: {
          extracted: opp,
          documentTitle,
          pageUrl,
        },
      };

      if (explicitUserAdd) {
        const savedNow = await persistUserConfirmedOpportunity({
          sourceId,
          row: baseRow,
          canonicalUrl,
          eventbriteEventId,
          userConfirmed: true,
          existingMatch,
        });
        userConfirmedSave = true;
        primaryOpportunityId = primaryOpportunityId ?? savedNow.contentItemId;
        if (savedNow.outcome === 'created') created += 1;
        else updated += 1;
        items.push({
          contentItemId: savedNow.contentItemId,
          title: baseRow.topic,
          location: baseRow.locationName ?? null,
          eventStartsAt: baseRow.eventStartsAt?.toISOString() ?? null,
          relevanceScore,
          urgencyScore,
          outcome: savedNow.outcome,
          sourceUrl: baseRow.sourceUrl ?? null,
        });
        savedTitles.push(baseRow.topic);
        pageQualified += 1;
        qualifiedCount += 1;

        enrichmentsAttempted += 1;
        try {
          if (sourceUrl !== pageUrl && !isMapSearchUrl(sourceUrl)) {
            const enriched = await fetchUrlWithPipeline(sourceUrl);
            if (enriched.title && enriched.title.length > title.length) {
              title = enriched.title.slice(0, 500);
            }
            if (enriched.description && !summary) {
              summary = enriched.description.slice(0, 800);
            }
          }

          if (
            !eventListingSource &&
            !pageEditorial &&
            !officialEventOccurrence &&
            webResearchAttempted < MAX_WEB_RESEARCH_PER_LINK
          ) {
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
        } catch {
          enrichmentFailed = true;
          enrichmentFailures += 1;
        }

        if (
          enrichmentFailed ||
          webResearch ||
          summary !== baseRow.script ||
          title !== baseRow.topic
        ) {
          const [existingRow] = await db
            .select({ metadata: contentItems.metadata, script: contentItems.script, topic: contentItems.topic })
            .from(contentItems)
            .where(eq(contentItems.id, savedNow.contentItemId))
            .limit(1);
          const metadata = (existingRow?.metadata ?? {}) as Record<string, unknown>;
          await db
            .update(contentItems)
            .set({
              topic: title.slice(0, 500),
              script: summary?.slice(0, 4000) ?? existingRow?.script ?? null,
              metadata: {
                ...metadata,
                enrichmentPending: enrichmentFailed,
                enrichmentErrors: enrichmentFailed
                  ? [
                      ...new Set([
                        ...(Array.isArray(metadata.enrichmentErrors)
                          ? metadata.enrichmentErrors.map(String)
                          : []),
                        'enrichment_follow_up_failed',
                      ]),
                    ]
                  : metadata.enrichmentErrors,
                askBensonCapture: {
                  ...((metadata.askBensonCapture as Record<string, unknown> | undefined) ?? {}),
                  enrichedFromUrl: Boolean(webResearch),
                  webResearch,
                },
              },
              updatedAt: new Date(),
            })
            .where(eq(contentItems.id, savedNow.contentItemId));
        }
        continue;
      }

      enrichmentsAttempted += 1;
      try {
        if (sourceUrl !== pageUrl && !isMapSearchUrl(sourceUrl)) {
          const enriched = await fetchUrlWithPipeline(sourceUrl);
          if (enriched.title && enriched.title.length > title.length) {
            title = enriched.title.slice(0, 500);
          }
          if (enriched.description && !summary) {
            summary = enriched.description.slice(0, 800);
          }
        }

        if (
          !eventListingSource &&
          !pageEditorial &&
          !officialEventOccurrence &&
          webResearchAttempted < MAX_WEB_RESEARCH_PER_LINK
        ) {
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
            if (officialCitation && !eventbriteEventId) {
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
      } catch {
        enrichmentFailed = true;
        enrichmentFailures += 1;
      }

      if (!qualification.qualified) {
        continue;
      }

      baseRow.topic = title.slice(0, 500);
      baseRow.script = summary?.slice(0, 4000) ?? null;
      baseRow.sourceUrl = isMapSearchUrl(sourceUrl) ? pageUrl : sourceUrl;
      baseRow.metadata = {
        ...(baseRow.metadata as Record<string, unknown>),
        askBensonCapture: {
          ...(((baseRow.metadata as Record<string, unknown>).askBensonCapture as Record<string, unknown>) ?? {}),
          enrichedFromUrl: true,
          webResearch,
        },
      };

      let outcome: 'created' | 'updated';
      let savedId: string;

      if (eventbriteEventId || existingMatch) {
        const merged = await persistUserConfirmedOpportunity({
          sourceId,
          row: baseRow,
          canonicalUrl,
          eventbriteEventId,
          userConfirmed: false,
          existingMatch,
        });
        outcome = merged.outcome;
        savedId = merged.contentItemId;
      } else {
        const persistResult = await persistIngestedContentItemResult(sourceId, externalId, () => baseRow, {
          sourceUrl,
          sharedHubProvenance: isContainerChild,
          childMatch: isContainerChild
            ? {
                title,
                eventStartsAt,
                eventDate: opp.eventDate?.trim() || null,
                venue: opp.location?.trim() || opp.venue?.trim() || null,
                listingUrl: pageUrl,
              }
            : undefined,
        });
        if (!persistResult.contentItemId) continue;
        outcome = persistResult.outcome === 'created' ? 'created' : 'updated';
        savedId = persistResult.contentItemId;
      }

      if (outcome === 'created') created += 1;
      else if (outcome === 'updated') updated += 1;
      else continue;

      items.push({
        contentItemId: savedId,
        title: baseRow.topic,
        location: baseRow.locationName ?? null,
        eventStartsAt: baseRow.eventStartsAt?.toISOString() ?? null,
        relevanceScore,
        urgencyScore,
        outcome,
        sourceUrl: baseRow.sourceUrl ?? null,
      });
      savedTitles.push(baseRow.topic);
      pageQualified += 1;
      qualifiedCount += 1;
    }

    if (officialEventOccurrence && !container.isContainer && pageQualified === 0) {
      const fallback = buildFallbackEventOpportunity({
        pageUrl,
        pageTitle: page.title ?? documentTitle,
        pageText: page.text,
        businessName,
      });
      if (fallback) {
        const fallbackOpp = applyListingProvenance(fallback, {
          listingUrl: pageUrl,
          listingLocation,
          listingVenueName,
        });
        const fallbackQual = qualifyUrlOpportunity({
          opp: fallbackOpp,
          pageUrl,
          sourceUrl: fallbackOpp.sourceUrl ?? pageUrl,
          entity,
          locationScope,
          pageText: page.text,
          directoryListing,
          eventListing: true,
        });
        const fallbackStart = parseEventDate(fallbackOpp.eventDate);
        const fallbackEnd = sanitizeEventEndInstant(
          fallbackStart,
          parseEventDate(fallbackOpp.eventEndDate),
        );
        if (fallbackQual.qualified && fallbackStart && !isPastEventDate(fallbackStart)) {
          const fallbackExternalId = buildUserOpportunityExternalId({
            canonicalUrl: normalizeCanonicalEventUrl(pageUrl),
            title: fallbackOpp.title,
            eventDateIso: fallbackStart.toISOString(),
            venue: fallbackOpp.venue ?? fallbackOpp.location,
          });
          const existingFallback = await findMatchingUserOpportunity({
            sourceId,
            canonicalUrl: normalizeCanonicalEventUrl(pageUrl),
            title: fallbackOpp.title,
            eventDate: fallbackStart,
            venue: fallbackOpp.venue ?? fallbackOpp.location,
          });
          const fallbackRow: NewContentItem = {
            campaignId,
            type: 'industry_insight',
            language: 'en',
            state: 'planned',
            topic: fallbackOpp.title.slice(0, 500),
            hook: formatOpportunityTypeLabel(entityOpportunityType ?? 'local_event'),
            script: fallbackOpp.summary?.slice(0, 4000) ?? null,
            sourceId,
            sourceExternalId: fallbackExternalId,
            sourceUrl: normalizeCanonicalEventUrl(pageUrl) ?? pageUrl,
            discoveredAt: new Date(),
            eventStartsAt: fallbackStart,
            eventEndsAt: fallbackEnd,
            locationName:
              fallbackOpp.location?.trim() ||
              fallbackOpp.venue?.trim() ||
              listingLocation,
            relevanceScore: '0.780',
            urgencyScore: '0.550',
            creatorValueStatus: 'creator_candidate',
            lifecycleStatus: computeLifecycleStatus({
              title: fallbackOpp.title,
              eventStartsAt: fallbackStart,
              eventEndsAt: fallbackEnd,
              discoveredAt: new Date(),
              metadata: { opportunityCategory: officialEventCategory(occurrenceSignals, fallbackOpp.title) },
            }),
            metadata: {
              ingest: 'ask_benson_link',
              opportunityLayer: 'claim',
              opportunityType: entityOpportunityType ?? 'local_event',
              opportunityCategory: officialEventCategory(occurrenceSignals, fallbackOpp.title),
              qualificationPassed: true,
              officialEventOccurrence: true,
              qualificationOutcome: 'OFFICIAL_EVENT_ACCEPTED',
              venue: fallbackOpp.venue ?? occurrenceSignals.venue ?? undefined,
              listingSourceUrl: pageUrl,
              canonicalEventUrl: normalizeCanonicalEventUrl(pageUrl),
              ticketUrl: occurrenceSignals.ticketUrl,
              verified: {
                officialDomain: entity.officialDomain,
                source: 'official_event_page',
              },
            },
            rawPayload: { extracted: fallbackOpp, pageUrl, officialEventOccurrence: true },
          };
          const savedFallback = await persistUserConfirmedOpportunity({
            sourceId,
            row: fallbackRow,
            canonicalUrl: normalizeCanonicalEventUrl(pageUrl),
            userConfirmed: false,
            existingMatch: existingFallback,
          });
          if (savedFallback.outcome === 'created') created += 1;
          else updated += 1;
          items.push({
            contentItemId: savedFallback.contentItemId,
            title: fallbackRow.topic,
            location: fallbackRow.locationName ?? null,
            eventStartsAt: fallbackStart.toISOString(),
            relevanceScore: 0.78,
            urgencyScore: 0.55,
            outcome: savedFallback.outcome,
            sourceUrl: fallbackRow.sourceUrl ?? null,
          });
          savedTitles.push(fallbackRow.topic);
          pageQualified += 1;
          qualifiedCount += 1;
          if (pageQuarantined > 0) {
            pageQuarantined -= 1;
            quarantinedCount = Math.max(0, quarantinedCount - 1);
          }
        }
      }
    }

    if (eventListingSource || pageEditorial || officialEventOccurrence) {
      qualificationOutcome = resolveIntakeOutcome({
        entityAccepted: false,
        pendingLocation: false,
        listingPage: true,
        staleEditorialRoundup: pageStaleEditorial,
        qualifiedClaimCount: pageQualified,
        quarantinedClaimCount: pageQuarantined,
        extractedClaimCount: extraction.opportunities.length,
      });
    } else if (explicitUserAdd && pageQualified > 0) {
      qualificationOutcome = 'ENTITY_ACCEPTED_CLAIMS_ACCEPTED';
    } else {
      qualificationOutcome = resolveIntakeOutcome({
        entityAccepted: entityPersisted,
        pendingLocation: Boolean(entityQualification.pendingLocation),
        qualifiedClaimCount: pageQualified,
        quarantinedClaimCount: pageQuarantined,
        extractedClaimCount: extraction.opportunities.length,
      });
    }

    if (urlType === 'social_post') {
      qualificationOutcome = 'SOCIAL_POST_INTAKE';
    }

    if (!eventListingSource && !entityPersisted && entityQualification.pendingLocation && !explicitUserAdd) {
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

    if (
      !pageStaleEditorial &&
      (entityPersisted || pageQualified >= 1) &&
      !isKnownSocialOrLinkHubUrl(pageUrl)
    ) {
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

  if (userConfirmedSave && primaryOpportunityId && !opportunityActions) {
    opportunityActions = buildEntityOpportunityActions(primaryOpportunityId, input.urls[0] ?? '');
  }

  // Positive opportunity CTAs require a real supported durable entity/opportunity.
  if (!entityOpportunityId && !primaryOpportunityId) {
    opportunityActions = undefined;
  }
  if (
    qualificationOutcome === 'NO_SUPPORTED_ENTITY' ||
    qualificationOutcome === 'ENTITY_REJECTED' ||
    qualificationOutcome === 'EDITORIAL_ROUNDUP_STALE' ||
    qualificationOutcome === 'SOCIAL_PROFILE_SOURCE' ||
    qualificationOutcome === 'LINK_HUB_INTAKE' ||
    (qualificationOutcome === 'SOCIAL_POST_INTAKE' && qualifiedCount === 0)
  ) {
    opportunityActions = undefined;
    entityOpportunityId = null;
    entityOpportunityTitle = null;
    entityCreated = false;
    entityUpdated = false;
  }

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
      calendarItemsCreated: items.filter((item) => item.eventStartsAt).length,
      instagramRoundup,
      instagramHandle,
      directoryListing,
      eventListing: eventListing || officialEventOccurrence,
      officialEventOccurrence,
      operatorCorrectionApplied: Boolean(
        input.userMessage &&
          /\b(?:is an event|not a restaurant|that date is wrong|that'?s a sale)\b/i.test(
            input.userMessage,
          ),
      ),
      editorialRoundup,
      staleEditorialRoundup,
      staleEditorialYear: staleEditorialRoundup
        ? extractRoundupYear(input.urls[0] ?? '', documentTitle)
        : null,
      retainedQuietlyCount,
      extractedCount,
      listingLabel: eventListing
        ? listingSourceLabel(documentTitle, entity?.domain ?? urlIntakeDiagnostics[0]?.domain)
        : null,
      listingCreated: eventListing ? created : undefined,
      listingUpdated: eventListing ? updated : undefined,
      extractedTitles: [...new Set(extractedTitles)].slice(0, 12),
      userConfirmedSave,
      enrichmentFailures,
      primaryOpportunityId,
      hubOwner,
      hubDestinations,
    },
  };
}
