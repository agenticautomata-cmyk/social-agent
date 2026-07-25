import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../db.js';
import { featureFlags } from '../feature-flags.js';
import {
  sources,
  scanRuns,
  contentItems,
  type Source,
  type NewContentItem,
} from '../schema.js';
import {
  loadRedditPosts,
  parseRedditSourceConfig,
  type NormalizedRedditPost,
} from '../providers/reddit.js';
import {
  loadVisitKcPosts,
  parseVisitKcSourceConfig,
  type NormalizedVisitKcItem,
} from '../providers/visitkc.js';
import {
  loadCrossroadsPosts,
  parseCrossroadsSourceConfig,
  type NormalizedCrossroadsItem,
} from '../providers/crossroads.js';
import {
  loadUnionStationEvents,
  parseUnionStationSourceConfig,
  type NormalizedUnionStationEvent,
} from '../providers/union-station.js';
import {
  loadKauffmanEvents,
  parseKauffmanSourceConfig,
  type NormalizedKauffmanEvent,
} from '../providers/kauffman.js';
import {
  loadSportingKcMatches,
  parseSportingKcSourceConfig,
  type NormalizedSportingKcMatch,
} from '../providers/sporting-kc.js';
import {
  loadRestaurantWeekPosts,
  parseRestaurantWeekSourceConfig,
  type NormalizedRestaurantWeekItem,
} from '../providers/restaurant-week.js';
import {
  loadPitchDiningPosts,
  parsePitchDiningSourceConfig,
  type NormalizedPitchDiningItem,
} from '../providers/pitch-dining.js';
import {
  loadKcParksEvents,
  parseKcParksSourceConfig,
  type NormalizedKcParksEvent,
} from '../providers/kc-parks.js';
import {
  loadKcLibraryEvents,
  parseKcLibrarySourceConfig,
  type NormalizedKcLibraryEvent,
} from '../providers/kc-library.js';
import {
  loadFirstFridaysEvents,
  parseFirstFridaysSourceConfig,
  type NormalizedFirstFridaysEvent,
} from '../providers/first-fridays.js';
import {
  loadEstateSalesNetSales,
  parseEstateSalesNetSourceConfig,
  type NormalizedEstateSale,
} from '../providers/estate-sales-net.js';
import {
  loadEstateSalesOrgSales,
  parseEstateSalesOrgSourceConfig,
} from '../providers/estate-sales-org.js';
import { isLuxuryEstateFind } from '../discount-watch/luxury-keywords.js';
import {
  loadBrownButtonEstates,
  parseBrownButtonEstatesSourceConfig,
} from '../providers/brown-button-estates.js';
import {
  loadPitchOpenings,
  parsePitchOpeningsSourceConfig,
} from '../providers/pitch-openings.js';
import {
  type NormalizedBusinessOpening,
} from '../providers/business-openings-shared.js';
import {
  loadPitchClosings,
  parsePitchClosingsSourceConfig,
} from '../providers/pitch-closings.js';
import {
  loadInKcClosings,
  parseInKcClosingsSourceConfig,
} from '../providers/inkc-closings.js';
import {
  loadLiquidationSalesNet,
  parseLiquidationSalesNetSourceConfig,
} from '../providers/liquidation-sales-net.js';
import {
  loadConsignmentKcShops,
  parseConsignmentKcSourceConfig,
} from '../providers/consignment-kc.js';
import {
  loadVisitKcLuxuryDeals,
  parseVisitKcLuxurySourceConfig,
} from '../providers/visitkc-luxury.js';
import {
  type NormalizedAudienceDeal,
} from '../providers/closings-deals-shared.js';
import {
  loadInKcOpenings,
  parseInKcOpeningsSourceConfig,
} from '../providers/inkc-openings.js';
import {
  loadVisitKcOpenings,
  parseVisitKcOpeningsSourceConfig,
} from '../providers/visitkc-openings.js';
import {
  loadMetroOpenings,
  parseMetroOpeningsSourceConfig,
} from '../providers/metro-openings.js';
import {
  loadMetroDeals,
  parseMetroDealsSourceConfig,
  type NormalizedMetroDeal,
} from '../providers/metro-deals.js';
import {
  type NormalizedRevenueOpportunity,
} from '../providers/revenue-alignment-shared.js';
import {
  loadVisitKcRomanticWeekends,
  parseVisitKcRomanticWeekendsSourceConfig,
} from '../providers/visitkc-romantic-weekends.js';
import {
  loadVisitKcLuxuryExperiences,
  parseVisitKcLuxuryExperiencesSourceConfig,
} from '../providers/visitkc-luxury-experiences.js';
import {
  loadKcHotelPackages,
  parseKcHotelPackagesSourceConfig,
} from '../providers/kc-hotel-packages.js';
import {
  loadCasinoHotelPackages,
  parseCasinoHotelPackagesSourceConfig,
} from '../providers/casino-hotel-packages.js';
import {
  loadSpaPackagesKc,
  parseSpaPackagesKcSourceConfig,
} from '../providers/spa-packages-kc.js';
import {
  loadRooftopBarsKc,
  parseRooftopBarsKcSourceConfig,
} from '../providers/rooftop-bars-kc.js';
import {
  loadWineTastingKc,
  parseWineTastingKcSourceConfig,
} from '../providers/wine-tasting-kc.js';
import {
  loadChefTastingMenus,
  parseChefTastingMenusSourceConfig,
} from '../providers/chef-tasting-menus.js';
import {
  loadKauffmanDateNights,
  parseKauffmanDateNightsSourceConfig,
} from '../providers/kauffman-date-nights.js';
import {
  loadRomanticRestaurantEvents,
  parseRomanticRestaurantEventsSourceConfig,
} from '../providers/romantic-restaurant-events.js';
import {
  type NormalizedCelebrityCharityEvent,
} from '../providers/celebrity-charity-shared.js';
import {
  loadBigSlickKcEvents,
  parseBigSlickKcSourceConfig,
} from '../providers/big-slick-kc.js';
import {
  loadChildrensMercyEvents,
  parseChildrensMercyEventsSourceConfig,
} from '../providers/childrens-mercy-events.js';
import {
  loadChiefsCharityEvents,
  parseChiefsCharityEventsSourceConfig,
} from '../providers/chiefs-charity-events.js';
import {
  loadRoyalsCharityEvents,
  parseRoyalsCharityEventsSourceConfig,
} from '../providers/royals-charity-events.js';
import {
  loadSportingKcCharityEvents,
  parseSportingKcCharitySourceConfig,
} from '../providers/sporting-kc-charity.js';
import {
  loadKcCurrentCharityEvents,
  parseKcCurrentCharitySourceConfig,
} from '../providers/kc-current-charity.js';
import {
  loadKauffmanCharityGalas,
  parseKauffmanCharityGalasSourceConfig,
} from '../providers/kauffman-charity-galas.js';
import {
  loadVisitKcCharityEvents,
  parseVisitKcCharityEventsSourceConfig,
} from '../providers/visitkc-charity-events.js';
import {
  loadKcNonprofitGalas,
  parseKcNonprofitGalasSourceConfig,
} from '../providers/kc-nonprofit-galas.js';
import {
  loadKcEntertainmentCharityEvents,
  parseKcEntertainmentCharitySourceConfig,
} from '../providers/kc-entertainment-charity.js';
import {
  dedupeAgainstOpeningSlugs,
  type NormalizedShoppingRetailItem,
} from '../providers/shopping-retail-shared.js';
import {
  persistIngestedContentItem,
  markExistingIngestItem,
  tallyIngestOutcome,
  type IngestPersistOutcome,
} from './ingest-persist.js';
import { slugify } from '../providers/business-openings-shared.js';
import {
  loadCountryClubPlazaEvents,
  parseCountryClubPlazaSourceConfig,
  loadCrownCenterRetailEvents,
  parseCrownCenterRetailSourceConfig,
  loadCorbinParkEvents,
  parseCorbinParkSourceConfig,
  loadPrairiefireRetailEvents,
  parsePrairiefireRetailSourceConfig,
  loadTownCenterPlazaEvents,
  parseTownCenterPlazaSourceConfig,
  loadZonaRosaEvents,
  parseZonaRosaSourceConfig,
  loadLegendsOutletsEvents,
  parseLegendsOutletsSourceConfig,
  loadStrawberrySwingEvents,
  parseStrawberrySwingSourceConfig,
  loadWestBottomsVintageEvents,
  parseWestBottomsVintageSourceConfig,
  loadRiverMarketVendorsEvents,
  parseRiverMarketVendorsSourceConfig,
  loadMadeInKcEvents,
  parseMadeInKcSourceConfig,
  loadCardshowsIoEvents,
  parseCardshowsIoSourceConfig,
  loadCollectAConEvents,
  parseCollectAConSourceConfig,
  loadPlanetComiconEvents,
  parsePlanetComiconSourceConfig,
} from '../providers/shopping-retail-providers.js';
import { scanScrapeListingSource } from './scrape-listing-source.js';
import type { ScanSourceResult } from './types.js';

type NormalizedFreeEvent =
  | NormalizedKcParksEvent
  | NormalizedKcLibraryEvent
  | NormalizedFirstFridaysEvent;

export type { ScanSourceResult } from './types.js';

export type ScanAllResult = {
  results: ScanSourceResult[];
  totalCreated: number;
};

async function insertRedditOpportunity(
  source: Source,
  post: NormalizedRedditPost,
): Promise<IngestPersistOutcome> {
  const now = new Date();
  return persistIngestedContentItem(
    source.id,
    post.externalId,
    () => ({
      campaignId: source.campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: post.title.slice(0, 500) || '(untitled reddit post)',
      hook: `r/${post.subreddit}`,
      script: post.body ? post.body.slice(0, 4000) : null,
      sourceId: source.id,
      sourceExternalId: post.externalId,
      sourceUrl: post.permalink,
      discoveredAt: now,
      locationName: post.locationHint,
      rawPayload: post as unknown as Record<string, unknown>,
      metadata: {
        ingest: 'reddit_rss',
        opportunityCategory: post.category,
        reddit: {
          subreddit: post.subreddit,
          publishedAt: post.publishedAt.toISOString(),
          locationClues: post.locationClues,
          url: post.permalink,
        },
      },
    }),
    { sourceUrl: post.permalink },
  );
}

async function scanRedditSource(source: Source): Promise<ScanSourceResult> {
  const config = parseRedditSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const posts = await loadRedditPosts(config);
    itemsFound = posts.length;

    for (const post of posts) {
      const outcome = await insertRedditOpportunity(source, post);
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', subreddit: config.subreddit, sort: config.sort },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}

async function insertVisitKcOpportunity(
  source: Source,
  item: NormalizedVisitKcItem,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || '(untitled visit kc release)',
    hook: 'Visit KC',
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.url,
    discoveredAt: now,
    locationName: item.locationHint,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: {
      ingest: 'visitkc_rss',
      opportunityCategory: item.contentType ?? 'tourism',
      visitkc: {
        url: item.url,
        publishedAt: item.publishedAt.toISOString(),
        locationClues: item.locationClues,
        contentType: item.contentType,
      },
    },
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanVisitKcSource(source: Source): Promise<ScanSourceResult> {
  const config = parseVisitKcSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadVisitKcPosts(config);
    itemsFound = items.length;

    for (const item of items) {
      const outcome = await insertVisitKcOpportunity(source, item);
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedUrl: config.feedUrl },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}

async function insertCrossroadsOpportunity(
  source: Source,
  item: NormalizedCrossroadsItem,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.url),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || '(untitled crossroads post)',
    hook: 'Crossroads',
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.url,
    discoveredAt: now,
    locationName: item.locationHint,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: {
      ingest: 'crossroads_rss',
      opportunityCategory: item.contentType ?? 'news',
      crossroads: {
        url: item.url,
        publishedAt: item.publishedAt.toISOString(),
        locationClues: item.locationClues,
        contentType: item.contentType,
        categories: item.categories,
      },
    },
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanCrossroadsSource(source: Source): Promise<ScanSourceResult> {
  const config = parseCrossroadsSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadCrossroadsPosts(config);
    itemsFound = items.length;

    for (const item of items) {
      const outcome = await insertCrossroadsOpportunity(source, item);
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedUrl: config.feedUrl },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}

async function insertUnionStationOpportunity(
  source: Source,
  event: NormalizedUnionStationEvent,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, event.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  if (event.url) {
    const urlDup = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceUrl, event.url),
    });
    if (urlDup) return markExistingIngestItem(urlDup.id);
  }

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: event.title.slice(0, 500) || '(untitled union station event)',
    hook: 'Union Station',
    script: event.body ? event.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: event.externalId,
    sourceUrl: event.url || null,
    discoveredAt: now,
    locationName: event.locationHint,
    eventStartsAt: event.eventStartsAt,
    eventEndsAt: event.eventEndsAt,
    rawPayload: event as unknown as Record<string, unknown>,
    metadata: {
      ingest: 'union_station_event_api',
      opportunityCategory: event.contentType,
      unionStation: {
        url: event.url,
        publishedAt: event.publishedAt.toISOString(),
        locationClues: event.locationClues,
        contentType: event.contentType,
        venue: event.venue,
        eventStartsAt: event.eventStartsAt?.toISOString() ?? null,
        eventEndsAt: event.eventEndsAt?.toISOString() ?? null,
      },
    },
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanUnionStationSource(source: Source): Promise<ScanSourceResult> {
  const config = parseUnionStationSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const events = await loadUnionStationEvents(config);
    itemsFound = events.length;

    for (const event of events) {
      const outcome = await insertUnionStationOpportunity(source, event);
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: {
          format: 'event_api',
          apiUrl: config.apiUrl,
          horizonDays: config.horizonDays,
        },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}

async function insertKauffmanOpportunity(
  source: Source,
  event: NormalizedKauffmanEvent,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, event.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  if (event.url) {
    const urlDup = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceUrl, event.url),
    });
    if (urlDup) return markExistingIngestItem(urlDup.id);
  }

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: event.title.slice(0, 500) || '(untitled kauffman event)',
    hook: 'Kauffman Center',
    script: event.body ? event.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: event.externalId,
    sourceUrl: event.url || null,
    discoveredAt: now,
    locationName: event.locationHint,
    eventStartsAt: event.eventStartsAt,
    eventEndsAt: event.eventEndsAt,
    rawPayload: event as unknown as Record<string, unknown>,
    metadata: {
      ingest: 'kauffman_event_api',
      opportunityCategory: event.contentType,
      kauffman: {
        url: event.url,
        publishedAt: event.publishedAt.toISOString(),
        locationClues: event.locationClues,
        contentType: event.contentType,
        venue: event.venue,
        eventStartsAt: event.eventStartsAt?.toISOString() ?? null,
        eventEndsAt: event.eventEndsAt?.toISOString() ?? null,
        productionSeasonId: event.externalId,
      },
    },
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanKauffmanSource(source: Source): Promise<ScanSourceResult> {
  const config = parseKauffmanSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const events = await loadKauffmanEvents(config);
    itemsFound = events.length;

    for (const event of events) {
      const outcome = await insertKauffmanOpportunity(source, event);
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: {
          format: 'event_api',
          apiUrl: config.apiUrl,
          horizonDays: config.horizonDays,
        },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}

async function insertSportingKcOpportunity(
  source: Source,
  match: NormalizedSportingKcMatch,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, match.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  if (match.url) {
    const urlDup = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceUrl, match.url),
    });
    if (urlDup) return markExistingIngestItem(urlDup.id);
  }

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: match.title.slice(0, 500) || '(untitled sporting kc match)',
    hook: 'Sporting KC',
    script: match.body ? match.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: match.externalId,
    sourceUrl: match.url || null,
    discoveredAt: now,
    locationName: match.locationHint,
    eventStartsAt: match.eventStartsAt,
    eventEndsAt: null,
    rawPayload: match as unknown as Record<string, unknown>,
    metadata: {
      ingest: 'sporting_kc_event_api',
      opportunityCategory: match.contentType,
      sportingKc: {
        url: match.url,
        publishedAt: match.publishedAt.toISOString(),
        locationClues: match.locationClues,
        contentType: match.contentType,
        opponent: match.opponent,
        homeAway: match.homeAway,
        venue: match.venue,
        eventStartsAt: match.eventStartsAt.toISOString(),
        matchOptaId: match.externalId,
      },
    },
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanSportingKcSource(source: Source): Promise<ScanSourceResult> {
  const config = parseSportingKcSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const matches = await loadSportingKcMatches(config);
    itemsFound = matches.length;

    for (const match of matches) {
      const outcome = await insertSportingKcOpportunity(source, match);
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: {
          format: 'event_api',
          apiUrl: config.apiUrl,
          horizonDays: config.horizonDays,
        },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}

async function insertRestaurantWeekOpportunity(
  source: Source,
  item: NormalizedRestaurantWeekItem,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.url),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || '(untitled restaurant week listing)',
    hook: 'KC Restaurant Week',
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.url,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.eventStartsAt,
    eventEndsAt: item.eventEndsAt,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: {
      ingest: 'restaurant_week_rss',
      opportunityCategory: 'dining',
      restaurantWeek: {
        url: item.url,
        publishedAt: item.publishedAt.toISOString(),
        locationClues: item.locationClues,
        venue: item.venue,
        address: item.address,
        region: item.region,
        diningCategory: item.diningCategory,
        openingFlag: item.openingFlag,
        restaurantWeekFlag: item.restaurantWeekFlag,
        menuTypes: item.menuTypes,
        eventStartsAt: item.eventStartsAt?.toISOString() ?? null,
        eventEndsAt: item.eventEndsAt?.toISOString() ?? null,
      },
    },
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanRestaurantWeekSource(source: Source): Promise<ScanSourceResult> {
  const config = parseRestaurantWeekSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadRestaurantWeekPosts(config);
    itemsFound = items.length;

    for (const item of items) {
      const outcome = await insertRestaurantWeekOpportunity(source, item);
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedUrl: config.feedUrl },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}

async function insertPitchDiningOpportunity(
  source: Source,
  item: NormalizedPitchDiningItem,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.url),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || '(untitled pitch dining post)',
    hook: 'The Pitch',
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.url,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.eventStartsAt,
    eventEndsAt: item.eventEndsAt,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: {
      ingest: 'pitch_dining_rss',
      opportunityCategory: 'dining',
      pitchDining: {
        url: item.url,
        publishedAt: item.publishedAt.toISOString(),
        locationClues: item.locationClues,
        venue: item.venue,
        address: item.address,
        diningCategory: item.diningCategory,
        openingFlag: item.openingFlag,
        restaurantWeekFlag: item.restaurantWeekFlag,
        eventStartsAt: item.eventStartsAt?.toISOString() ?? null,
        eventEndsAt: item.eventEndsAt?.toISOString() ?? null,
      },
    },
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanPitchDiningSource(source: Source): Promise<ScanSourceResult> {
  const config = parsePitchDiningSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadPitchDiningPosts(config);
    itemsFound = items.length;

    for (const item of items) {
      const outcome = await insertPitchDiningOpportunity(source, item);
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedUrl: config.feedUrl },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}

function buildFreeEventMetadata(
  ingest: string,
  metaKey: string,
  item: NormalizedFreeEvent,
): Record<string, unknown> {
  return {
    ingest,
    opportunityCategory: 'free',
    [metaKey]: {
      url: item.url,
      publishedAt: item.publishedAt.toISOString(),
      locationClues: item.locationClues,
      venue: item.venue,
      address: item.address,
      neighborhood: item.neighborhood,
      freeEventFlag: item.freeEventFlag,
      eventCategory: item.eventCategory,
      eventStartsAt: item.eventStartsAt?.toISOString() ?? null,
      eventEndsAt: item.eventEndsAt?.toISOString() ?? null,
    },
  };
}

async function insertFreeEventOpportunity(
  source: Source,
  item: NormalizedFreeEvent,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.url),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || fallbackTopic,
    hook,
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.url,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.eventStartsAt,
    eventEndsAt: item.eventEndsAt,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: buildFreeEventMetadata(ingest, metaKey, item),
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanKcParksSource(source: Source): Promise<ScanSourceResult> {
  const config = parseKcParksSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadKcParksEvents(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertFreeEventOpportunity(
        source,
        item,
        'KC Parks',
        'kc_parks_event_api',
        'kcParks',
        '(untitled kc parks event)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'event_api', apiUrl: config.apiUrl, horizonDays: config.horizonDays },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanKcLibrarySource(source: Source): Promise<ScanSourceResult> {
  const config = parseKcLibrarySourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadKcLibraryEvents(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertFreeEventOpportunity(
        source,
        item,
        'KC Library',
        'kc_library_scrape',
        'kcLibrary',
        '(untitled kc library event)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'scrape', calendarUrl: config.calendarUrl },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanFirstFridaysSource(source: Source): Promise<ScanSourceResult> {
  const config = parseFirstFridaysSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadFirstFridaysEvents(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertFreeEventOpportunity(
        source,
        item,
        'First Fridays',
        'first_fridays_rules',
        'firstFridays',
        '(untitled first fridays event)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rules', horizonDays: config.horizonDays },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

function buildEstateSaleMetadata(
  ingest: string,
  metaKey: string,
  item: NormalizedEstateSale,
): Record<string, unknown> {
  const luxuryEstate = isLuxuryEstateFind(item.title, item.body);
  return {
    ingest,
    opportunityCategory: luxuryEstate ? 'luxury_deal' : 'estate_sale',
    luxuryEstateFlag: luxuryEstate,
    alsoCategories: luxuryEstate ? ['estate_sale', 'luxury_deal'] : ['estate_sale'],
    estateSaleFlag: true,
    [metaKey]: {
      url: item.url,
      title: item.title,
      company: item.company,
      address: item.address,
      city: item.city,
      neighborhood: item.neighborhood,
      publishedAt: item.publishedAt.toISOString(),
      locationClues: item.locationClues,
      estateSaleFlag: item.estateSaleFlag,
      eventStartsAt: item.eventStartsAt?.toISOString() ?? null,
      eventEndsAt: item.eventEndsAt?.toISOString() ?? null,
    },
  };
}

async function insertEstateSaleOpportunity(
  source: Source,
  item: NormalizedEstateSale,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
): Promise<IngestPersistOutcome> {
  const luxuryEstate = isLuxuryEstateFind(item.title, item.body);
  const displayHook = luxuryEstate ? `Luxury estate find — ${hook}` : hook;

  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.url),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || fallbackTopic,
    hook: displayHook,
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.url,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.eventStartsAt,
    eventEndsAt: item.eventEndsAt,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: buildEstateSaleMetadata(ingest, metaKey, item),
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanEstateSalesNetSource(source: Source): Promise<ScanSourceResult> {
  const config = parseEstateSalesNetSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadEstateSalesNetSales(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertEstateSaleOpportunity(
        source,
        item,
        'EstateSales.net',
        'estate_sales_net_scrape',
        'estateSalesNet',
        '(untitled estate sale)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'scrape', zipPages: config.zipPageUrls?.length ?? 10, horizonDays: config.horizonDays },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanEstateSalesOrgSource(source: Source): Promise<ScanSourceResult> {
  const config = parseEstateSalesOrgSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadEstateSalesOrgSales(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertEstateSaleOpportunity(
        source,
        item,
        'EstateSales.org',
        'estate_sales_org_scrape',
        'estateSalesOrg',
        '(untitled estate sale)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'scrape', listingUrl: config.listingUrl, horizonDays: config.horizonDays },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanBrownButtonEstatesSource(source: Source): Promise<ScanSourceResult> {
  const config = parseBrownButtonEstatesSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadBrownButtonEstates(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertEstateSaleOpportunity(
        source,
        item,
        'Brown Button',
        'brown_button_estates_scrape',
        'brownButtonEstates',
        '(untitled estate sale)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'scrape', upcomingUrl: config.upcomingUrl, horizonDays: config.horizonDays },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

function buildBusinessOpeningMetadata(
  ingest: string,
  metaKey: string,
  item: NormalizedBusinessOpening,
): Record<string, unknown> {
  return {
    ingest,
    opportunityCategory: item.category,
    [metaKey]: {
      businessName: item.businessName,
      category: item.category,
      openingDate: item.openingDate?.toISOString() ?? null,
      address: item.address,
      neighborhood: item.neighborhood,
      website: item.website,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt.toISOString(),
      locationClues: item.locationClues,
      openingFlag: item.openingFlag,
    },
  };
}

async function insertBusinessOpeningOpportunity(
  source: Source,
  item: NormalizedBusinessOpening,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.sourceUrl),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || fallbackTopic,
    hook,
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.sourceUrl,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.openingDate,
    eventEndsAt: null,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: buildBusinessOpeningMetadata(ingest, metaKey, item),
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanPitchOpeningsSource(source: Source): Promise<ScanSourceResult> {
  const config = parsePitchOpeningsSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadPitchOpenings(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertBusinessOpeningOpportunity(
        source,
        item,
        'Pitch KC Openings',
        'pitch_openings_rss',
        'pitchOpenings',
        '(untitled business opening)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedCount: config.feedUrls?.length ?? 5 },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanInKcOpeningsSource(source: Source): Promise<ScanSourceResult> {
  const config = parseInKcOpeningsSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadInKcOpenings(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertBusinessOpeningOpportunity(
        source,
        item,
        'In Kansas City',
        'inkc_openings_rss',
        'inkcOpenings',
        '(untitled business opening)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedUrl: config.feedUrl },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanVisitKcOpeningsSource(source: Source): Promise<ScanSourceResult> {
  const config = parseVisitKcOpeningsSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadVisitKcOpenings(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertBusinessOpeningOpportunity(
        source,
        item,
        'Visit KC Openings',
        'visitkc_openings_rss',
        'visitkcOpenings',
        '(untitled business opening)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedUrl: config.feedUrl },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanMetroOpeningsSource(source: Source): Promise<ScanSourceResult> {
  const config = parseMetroOpeningsSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadMetroOpenings(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertBusinessOpeningOpportunity(
        source,
        item,
        source.name,
        'metro_openings_rss',
        'metroOpenings',
        '(untitled business opening)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedUrl: config.feedUrl, strict: config.strictOpeningFilter ?? false },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

function buildMetroDealMetadata(item: NormalizedMetroDeal): Record<string, unknown> {
  return {
    ingest: 'discount_watch',
    opportunityCategory: item.category,
    discountWatch: { newDeal: true },
    metroDeal: {
      businessName: item.businessName,
      category: item.category,
      percentOff: item.percentOff,
      priceHint: item.priceHint,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt.toISOString(),
      locationHint: item.locationHint,
    },
  };
}

async function insertMetroDealOpportunity(
  source: Source,
  item: NormalizedMetroDeal,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.sourceUrl),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || '(untitled deal)',
    hook: `Deal watch — ${source.name}`,
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.sourceUrl,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.eventDate,
    eventEndsAt: null,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: buildMetroDealMetadata(item),
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanMetroDealsSource(source: Source): Promise<ScanSourceResult> {
  const config = parseMetroDealsSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadMetroDeals(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertMetroDealOpportunity(source, item);
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'rss', feedUrl: config.feedUrl, strict: config.strictDealFilter ?? false },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error })
      .where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

function buildAudienceDealMetadata(
  ingest: string,
  metaKey: string,
  item: NormalizedAudienceDeal,
): Record<string, unknown> {
  return {
    ingest,
    opportunityCategory: item.category,
    [metaKey]: {
      businessName: item.businessName,
      title: item.title,
      category: item.category,
      startDate: item.startDate?.toISOString() ?? null,
      endDate: item.endDate?.toISOString() ?? null,
      address: item.address,
      neighborhood: item.neighborhood,
      website: item.website,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt.toISOString(),
      locationClues: item.locationClues,
      closingFlag: item.closingFlag,
      liquidationFlag: item.liquidationFlag,
      consignmentFlag: item.consignmentFlag,
      luxuryFlag: item.luxuryFlag,
    },
  };
}

async function insertAudienceDealOpportunity(
  source: Source,
  item: NormalizedAudienceDeal,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.sourceUrl),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || fallbackTopic,
    hook,
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.sourceUrl,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.startDate,
    eventEndsAt: item.endDate,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: buildAudienceDealMetadata(ingest, metaKey, item),
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanPitchClosingsSource(source: Source): Promise<ScanSourceResult> {
  const config = parsePitchClosingsSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadPitchClosings(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertAudienceDealOpportunity(
        source,
        item,
        'Pitch KC Closings',
        'pitch_closings_rss',
        'pitchClosings',
        '(untitled business closing)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db.update(sources).set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'success', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, payload: { format: 'rss' } }).where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({ lastError: error, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error }).where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanInKcClosingsSource(source: Source): Promise<ScanSourceResult> {
  const config = parseInKcClosingsSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadInKcClosings(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertAudienceDealOpportunity(
        source,
        item,
        'In Kansas City Closings',
        'inkc_closings_rss',
        'inkcClosings',
        '(untitled business closing)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db.update(sources).set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'success', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, payload: { format: 'rss' } }).where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({ lastError: error, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error }).where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanLiquidationSalesNetSource(source: Source): Promise<ScanSourceResult> {
  const config = parseLiquidationSalesNetSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadLiquidationSalesNet(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertAudienceDealOpportunity(
        source,
        item,
        'Liquidation Sales',
        'liquidation_sales_net_scrape',
        'liquidationSalesNet',
        '(untitled liquidation sale)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db.update(sources).set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'success', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, payload: { format: 'scrape' } }).where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({ lastError: error, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error }).where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanConsignmentKcSource(source: Source): Promise<ScanSourceResult> {
  const config = parseConsignmentKcSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadConsignmentKcShops(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertAudienceDealOpportunity(
        source,
        item,
        'KC Consignment',
        'consignment_kc_directory',
        'consignmentKc',
        '(untitled consignment shop)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db.update(sources).set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'success', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, payload: { format: 'directory' } }).where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({ lastError: error, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error }).where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanVisitKcLuxurySource(source: Source): Promise<ScanSourceResult> {
  const config = parseVisitKcLuxurySourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadVisitKcLuxuryDeals(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertAudienceDealOpportunity(
        source,
        item,
        'Visit KC Luxury',
        'visitkc_luxury_rss',
        'visitkcLuxury',
        '(untitled luxury deal)',
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db.update(sources).set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'success', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, payload: { format: 'rss' } }).where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({ lastError: error, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error }).where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

function buildRevenueOpportunityMetadata(
  ingest: string,
  metaKey: string,
  item: NormalizedRevenueOpportunity,
): Record<string, unknown> {
  return {
    ingest,
    opportunityCategory: item.category,
    [metaKey]: {
      businessName: item.businessName,
      title: item.title,
      venue: item.venue,
      category: item.category,
      eventDate: item.eventDate?.toISOString() ?? null,
      startDate: item.startDate?.toISOString() ?? null,
      endDate: item.endDate?.toISOString() ?? null,
      address: item.address,
      neighborhood: item.neighborhood,
      website: item.website,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt.toISOString(),
      locationClues: item.locationClues,
      hotelFlag: item.hotelFlag,
      spaFlag: item.spaFlag,
      dateNightFlag: item.dateNightFlag,
      luxuryFlag: item.luxuryFlag,
      rooftopFlag: item.rooftopFlag,
    },
  };
}

async function insertRevenueOpportunity(
  source: Source,
  item: NormalizedRevenueOpportunity,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.sourceUrl),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || fallbackTopic,
    hook,
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.sourceUrl,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.eventDate ?? item.startDate,
    eventEndsAt: item.endDate,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: buildRevenueOpportunityMetadata(ingest, metaKey, item),
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanRevenueAlignmentSource(
  source: Source,
  loadItems: (config: unknown) => Promise<NormalizedRevenueOpportunity[]>,
  parseConfig: (raw: unknown) => unknown,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
  payloadFormat: string,
): Promise<ScanSourceResult> {
  const config = parseConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadItems(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertRevenueOpportunity(
        source,
        item,
        hook,
        ingest,
        metaKey,
        fallbackTopic,
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db.update(sources).set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'success', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, payload: { format: payloadFormat } }).where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({ lastError: error, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error }).where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanVisitKcRomanticWeekendsSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadVisitKcRomanticWeekends(c as ReturnType<typeof parseVisitKcRomanticWeekendsSourceConfig>),
    parseVisitKcRomanticWeekendsSourceConfig,
    'Visit KC Romantic Weekends',
    'visitkc_romantic_weekends_rss',
    'visitkcRomanticWeekends',
    '(untitled romantic weekend)',
    'rss',
  );
}

async function scanVisitKcLuxuryExperiencesSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadVisitKcLuxuryExperiences(c as ReturnType<typeof parseVisitKcLuxuryExperiencesSourceConfig>),
    parseVisitKcLuxuryExperiencesSourceConfig,
    'Visit KC Luxury Experiences',
    'visitkc_luxury_experiences_rss',
    'visitkcLuxuryExperiences',
    '(untitled luxury experience)',
    'rss',
  );
}

async function scanKcHotelPackagesSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadKcHotelPackages(c as ReturnType<typeof parseKcHotelPackagesSourceConfig>),
    parseKcHotelPackagesSourceConfig,
    'KC Hotel Packages',
    'kc_hotel_packages_directory',
    'kcHotelPackages',
    '(untitled hotel package)',
    'directory',
  );
}

async function scanCasinoHotelPackagesSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadCasinoHotelPackages(c as ReturnType<typeof parseCasinoHotelPackagesSourceConfig>),
    parseCasinoHotelPackagesSourceConfig,
    'Casino Hotel Packages',
    'casino_hotel_packages_directory',
    'casinoHotelPackages',
    '(untitled casino hotel package)',
    'directory',
  );
}

async function scanSpaPackagesKcSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadSpaPackagesKc(c as ReturnType<typeof parseSpaPackagesKcSourceConfig>),
    parseSpaPackagesKcSourceConfig,
    'KC Spa Packages',
    'spa_packages_kc_directory',
    'spaPackagesKc',
    '(untitled spa package)',
    'directory',
  );
}

async function scanRooftopBarsKcSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadRooftopBarsKc(c as ReturnType<typeof parseRooftopBarsKcSourceConfig>),
    parseRooftopBarsKcSourceConfig,
    'KC Rooftop Bars',
    'rooftop_bars_kc_directory',
    'rooftopBarsKc',
    '(untitled rooftop experience)',
    'directory',
  );
}

async function scanWineTastingKcSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadWineTastingKc(c as ReturnType<typeof parseWineTastingKcSourceConfig>),
    parseWineTastingKcSourceConfig,
    'KC Wine Tastings',
    'wine_tasting_kc_directory',
    'wineTastingKc',
    '(untitled wine tasting)',
    'directory',
  );
}

async function scanChefTastingMenusSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadChefTastingMenus(c as ReturnType<typeof parseChefTastingMenusSourceConfig>),
    parseChefTastingMenusSourceConfig,
    'Chef Tasting Menus',
    'chef_tasting_menus_directory',
    'chefTastingMenus',
    '(untitled tasting menu)',
    'directory',
  );
}

async function scanKauffmanDateNightsSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadKauffmanDateNights(c as ReturnType<typeof parseKauffmanDateNightsSourceConfig>),
    parseKauffmanDateNightsSourceConfig,
    'Kauffman Date Nights',
    'kauffman_date_nights_api',
    'kauffmanDateNights',
    '(untitled date night performance)',
    'event_api',
  );
}

async function scanRomanticRestaurantEventsSource(source: Source): Promise<ScanSourceResult> {
  return scanRevenueAlignmentSource(
    source,
    (c) => loadRomanticRestaurantEvents(c as ReturnType<typeof parseRomanticRestaurantEventsSourceConfig>),
    parseRomanticRestaurantEventsSourceConfig,
    'Romantic Restaurant Events',
    'romantic_restaurant_events_rss',
    'romanticRestaurantEvents',
    '(untitled romantic restaurant event)',
    'rss',
  );
}

function buildCelebrityCharityMetadata(
  ingest: string,
  metaKey: string,
  item: NormalizedCelebrityCharityEvent,
): Record<string, unknown> {
  return {
    ingest,
    opportunityCategory: item.category,
    [metaKey]: {
      title: item.title,
      celebrityNames: item.celebrityNames,
      nonprofit: item.nonprofit,
      venue: item.venue,
      category: item.category,
      eventDate: item.eventDate?.toISOString() ?? null,
      startDate: item.startDate?.toISOString() ?? null,
      endDate: item.endDate?.toISOString() ?? null,
      address: item.address,
      neighborhood: item.neighborhood,
      ticketUrl: item.ticketUrl,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt.toISOString(),
      locationClues: item.locationClues,
      celebrityFlag: item.celebrityFlag,
      charityFlag: item.charityFlag,
      fundraiserFlag: item.fundraiserFlag,
      galaFlag: item.galaFlag,
    },
  };
}

async function insertCelebrityCharityEvent(
  source: Source,
  item: NormalizedCelebrityCharityEvent,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.sourceUrl),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || fallbackTopic,
    hook,
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.sourceUrl,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.eventDate ?? item.startDate,
    eventEndsAt: item.endDate,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: buildCelebrityCharityMetadata(ingest, metaKey, item),
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanCelebrityCharitySource(
  source: Source,
  loadItems: (config: unknown) => Promise<NormalizedCelebrityCharityEvent[]>,
  parseConfig: (raw: unknown) => unknown,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
  payloadFormat: string,
): Promise<ScanSourceResult> {
  const config = parseConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const items = await loadItems(config);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertCelebrityCharityEvent(
        source,
        item,
        hook,
        ingest,
        metaKey,
        fallbackTopic,
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db.update(sources).set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'success', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, payload: { format: payloadFormat } }).where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({ lastError: error, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error }).where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanBigSlickKcSource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadBigSlickKcEvents(c as ReturnType<typeof parseBigSlickKcSourceConfig>), parseBigSlickKcSourceConfig, 'Big Slick KC', 'big_slick_kc_scrape', 'bigSlickKc', '(untitled Big Slick event)', 'scrape');
}

async function scanChildrensMercyEventsSource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadChildrensMercyEvents(c as ReturnType<typeof parseChildrensMercyEventsSourceConfig>), parseChildrensMercyEventsSourceConfig, 'Children\'s Mercy Events', 'childrens_mercy_events_directory', 'childrensMercyEvents', '(untitled Children\'s Mercy event)', 'directory');
}

async function scanChiefsCharityEventsSource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadChiefsCharityEvents(c as ReturnType<typeof parseChiefsCharityEventsSourceConfig>), parseChiefsCharityEventsSourceConfig, 'Chiefs Charity Events', 'chiefs_charity_events_directory', 'chiefsCharityEvents', '(untitled Chiefs charity event)', 'directory');
}

async function scanRoyalsCharityEventsSource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadRoyalsCharityEvents(c as ReturnType<typeof parseRoyalsCharityEventsSourceConfig>), parseRoyalsCharityEventsSourceConfig, 'Royals Charity Events', 'royals_charity_events_directory', 'royalsCharityEvents', '(untitled Royals charity event)', 'directory');
}

async function scanSportingKcCharitySource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadSportingKcCharityEvents(c as ReturnType<typeof parseSportingKcCharitySourceConfig>), parseSportingKcCharitySourceConfig, 'Sporting KC Charity', 'sporting_kc_charity_directory', 'sportingKcCharity', '(untitled Sporting KC charity event)', 'directory');
}

async function scanKcCurrentCharitySource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadKcCurrentCharityEvents(c as ReturnType<typeof parseKcCurrentCharitySourceConfig>), parseKcCurrentCharitySourceConfig, 'KC Current Charity', 'kc_current_charity_directory', 'kcCurrentCharity', '(untitled KC Current charity event)', 'directory');
}

async function scanKauffmanCharityGalasSource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadKauffmanCharityGalas(c as ReturnType<typeof parseKauffmanCharityGalasSourceConfig>), parseKauffmanCharityGalasSourceConfig, 'Kauffman Charity Galas', 'kauffman_charity_galas_api', 'kauffmanCharityGalas', '(untitled Kauffman charity event)', 'event_api');
}

async function scanVisitKcCharityEventsSource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadVisitKcCharityEvents(c as ReturnType<typeof parseVisitKcCharityEventsSourceConfig>), parseVisitKcCharityEventsSourceConfig, 'Visit KC Charity Events', 'visitkc_charity_events_rss', 'visitkcCharityEvents', '(untitled Visit KC charity event)', 'rss');
}

async function scanKcNonprofitGalasSource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadKcNonprofitGalas(c as ReturnType<typeof parseKcNonprofitGalasSourceConfig>), parseKcNonprofitGalasSourceConfig, 'KC Nonprofit Galas', 'kc_nonprofit_galas_directory', 'kcNonprofitGalas', '(untitled nonprofit gala)', 'directory');
}

async function scanKcEntertainmentCharitySource(source: Source): Promise<ScanSourceResult> {
  return scanCelebrityCharitySource(source, (c) => loadKcEntertainmentCharityEvents(c as ReturnType<typeof parseKcEntertainmentCharitySourceConfig>), parseKcEntertainmentCharitySourceConfig, 'KC Entertainment Charity', 'kc_entertainment_charity_mixed', 'kcEntertainmentCharity', '(untitled entertainment charity event)', 'mixed');
}

const OPENING_DEDUP_CATEGORIES = new Set([
  'restaurant_opening',
  'boutique_opening',
  'coffee_opening',
  'grand_opening',
  'business_opening',
]);

async function loadOpeningBusinessSlugs(): Promise<Set<string>> {
  const rows = await db.select({ topic: contentItems.topic, metadata: contentItems.metadata }).from(contentItems);
  const slugs = new Set<string>();
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const cat = meta.opportunityCategory;
    if (typeof cat !== 'string' || !OPENING_DEDUP_CATEGORIES.has(cat)) continue;
    let businessName: string | null = null;
    for (const value of Object.values(meta)) {
      if (typeof value === 'object' && value !== null && 'businessName' in value) {
        const bn = (value as { businessName?: string }).businessName;
        if (typeof bn === 'string' && bn.trim()) businessName = bn.trim();
      }
    }
    slugs.add(slugify(businessName ?? row.topic));
  }
  return slugs;
}

function buildShoppingRetailMetadata(
  ingest: string,
  metaKey: string,
  item: NormalizedShoppingRetailItem,
): Record<string, unknown> {
  return {
    ingest,
    opportunityCategory: item.category,
    [metaKey]: {
      title: item.title,
      businessName: item.businessName,
      eventName: item.eventName,
      category: item.category,
      venue: item.venue,
      address: item.address,
      neighborhood: item.neighborhood,
      eventStartsAt: item.eventStartsAt?.toISOString() ?? null,
      eventEndsAt: item.eventEndsAt?.toISOString() ?? null,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt.toISOString(),
      locationClues: item.locationClues,
      shoppingFlag: item.shoppingFlag,
      retailFlag: item.retailFlag,
      vendorMarketFlag: item.vendorMarketFlag,
      collectorFlag: item.collectorFlag,
    },
  };
}

async function insertShoppingRetailOpportunity(
  source: Source,
  item: NormalizedShoppingRetailItem,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
): Promise<IngestPersistOutcome> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, item.externalId),
    ),
  });
  if (existing) return markExistingIngestItem(existing.id);

  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, item.sourceUrl),
  });
  if (urlDup) return markExistingIngestItem(urlDup.id);

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: item.title.slice(0, 500) || fallbackTopic,
    hook,
    script: item.body ? item.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: item.externalId,
    sourceUrl: item.sourceUrl,
    discoveredAt: now,
    locationName: item.locationHint,
    eventStartsAt: item.eventStartsAt,
    eventEndsAt: item.eventEndsAt,
    rawPayload: item as unknown as Record<string, unknown>,
    metadata: buildShoppingRetailMetadata(ingest, metaKey, item),
  };

  return persistIngestedContentItem(source.id, row.sourceExternalId!, () => row, { sourceUrl: row.sourceUrl });
}

async function scanShoppingRetailSource(
  source: Source,
  loadItems: (config: unknown) => Promise<NormalizedShoppingRetailItem[]>,
  parseConfig: (raw: unknown) => unknown,
  hook: string,
  ingest: string,
  metaKey: string,
  fallbackTopic: string,
  payloadFormat: string,
): Promise<ScanSourceResult> {
  const config = parseConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({ sourceId: source.id, campaignId: source.campaignId, status: 'running' })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const openingSlugs = await loadOpeningBusinessSlugs();
    const rawItems = await loadItems(config);
    const items = dedupeAgainstOpeningSlugs(rawItems, openingSlugs);
    itemsFound = items.length;
    for (const item of items) {
      const outcome = await insertShoppingRetailOpportunity(
        source,
        item,
        hook,
        ingest,
        metaKey,
        fallbackTopic,
      );
      tallyIngestOutcome(outcome, ingestCounts);
    }
    await db.update(sources).set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'success', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, payload: { format: payloadFormat } }).where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({ lastError: error, updatedAt: new Date() }).where(eq(sources.id, source.id));
    await db.update(scanRuns).set({ status: 'failed', finishedAt: new Date(), itemsFound, itemsCreated: ingestCounts.created, itemsSkipped: ingestCounts.skipped, error }).where(eq(scanRuns.id, run!.id));
  }

  return { sourceId: source.id, scanRunId: run!.id, itemsFound, itemsCreated: ingestCounts.created, itemsUpdated: ingestCounts.updated, itemsSkipped: ingestCounts.skipped, error };
}

async function scanCountryClubPlazaSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadCountryClubPlazaEvents(c as ReturnType<typeof parseCountryClubPlazaSourceConfig>), parseCountryClubPlazaSourceConfig, 'Country Club Plaza', 'country_club_plaza_directory', 'countryClubPlaza', '(untitled Plaza retail event)', 'directory');
}
async function scanCrownCenterRetailSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadCrownCenterRetailEvents(c as ReturnType<typeof parseCrownCenterRetailSourceConfig>), parseCrownCenterRetailSourceConfig, 'Crown Center Retail', 'crown_center_retail_directory', 'crownCenterRetail', '(untitled Crown Center retail event)', 'directory');
}
async function scanCorbinParkSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadCorbinParkEvents(c as ReturnType<typeof parseCorbinParkSourceConfig>), parseCorbinParkSourceConfig, 'Corbin Park', 'corbin_park_directory', 'corbinPark', '(untitled Corbin Park retail event)', 'directory');
}
async function scanPrairiefireRetailSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadPrairiefireRetailEvents(c as ReturnType<typeof parsePrairiefireRetailSourceConfig>), parsePrairiefireRetailSourceConfig, 'Prairiefire Retail', 'prairiefire_retail_directory', 'prairiefireRetail', '(untitled Prairiefire retail event)', 'directory');
}
async function scanTownCenterPlazaSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadTownCenterPlazaEvents(c as ReturnType<typeof parseTownCenterPlazaSourceConfig>), parseTownCenterPlazaSourceConfig, 'Town Center Plaza', 'town_center_plaza_directory', 'townCenterPlaza', '(untitled Town Center retail event)', 'directory');
}
async function scanZonaRosaSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadZonaRosaEvents(c as ReturnType<typeof parseZonaRosaSourceConfig>), parseZonaRosaSourceConfig, 'Zona Rosa', 'zona_rosa_directory', 'zonaRosa', '(untitled Zona Rosa retail event)', 'directory');
}
async function scanLegendsOutletsSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadLegendsOutletsEvents(c as ReturnType<typeof parseLegendsOutletsSourceConfig>), parseLegendsOutletsSourceConfig, 'Legends Outlets', 'legends_outlets_directory', 'legendsOutlets', '(untitled Legends Outlets event)', 'directory');
}
async function scanStrawberrySwingSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadStrawberrySwingEvents(c as ReturnType<typeof parseStrawberrySwingSourceConfig>), parseStrawberrySwingSourceConfig, 'Strawberry Swing', 'strawberry_swing_directory', 'strawberrySwing', '(untitled Strawberry Swing event)', 'directory');
}
async function scanWestBottomsVintageSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadWestBottomsVintageEvents(c as ReturnType<typeof parseWestBottomsVintageSourceConfig>), parseWestBottomsVintageSourceConfig, 'West Bottoms Vintage', 'west_bottoms_vintage_directory', 'westBottomsVintage', '(untitled West Bottoms vintage event)', 'directory');
}
async function scanRiverMarketVendorsSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadRiverMarketVendorsEvents(c as ReturnType<typeof parseRiverMarketVendorsSourceConfig>), parseRiverMarketVendorsSourceConfig, 'River Market Vendors', 'river_market_vendors_directory', 'riverMarketVendors', '(untitled River Market vendor event)', 'directory');
}
async function scanMadeInKcSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadMadeInKcEvents(c as ReturnType<typeof parseMadeInKcSourceConfig>), parseMadeInKcSourceConfig, 'Made in KC', 'made_in_kc_directory', 'madeInKc', '(untitled Made in KC event)', 'directory');
}
async function scanCardshowsIoSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadCardshowsIoEvents(c as ReturnType<typeof parseCardshowsIoSourceConfig>), parseCardshowsIoSourceConfig, 'CardShows.io', 'cardshows_io_directory', 'cardshowsIo', '(untitled card show event)', 'directory');
}
async function scanCollectAConSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadCollectAConEvents(c as ReturnType<typeof parseCollectAConSourceConfig>), parseCollectAConSourceConfig, 'Collect-A-Con', 'collect_a_con_directory', 'collectACon', '(untitled Collect-A-Con event)', 'directory');
}
async function scanPlanetComiconSource(source: Source): Promise<ScanSourceResult> {
  return scanShoppingRetailSource(source, (c) => loadPlanetComiconEvents(c as ReturnType<typeof parsePlanetComiconSourceConfig>), parsePlanetComiconSourceConfig, 'Planet Comicon', 'planet_comicon_directory', 'planetComicon', '(untitled Planet Comicon event)', 'directory');
}

async function scanSourceByType(source: Source): Promise<ScanSourceResult> {
  if (source.type === 'reddit') return scanRedditSource(source);
  if (source.type === 'visitkc') return scanVisitKcSource(source);
  if (source.type === 'crossroads') return scanCrossroadsSource(source);
  if (source.type === 'union_station') return scanUnionStationSource(source);
  if (source.type === 'kauffman') return scanKauffmanSource(source);
  if (source.type === 'sporting_kc') return scanSportingKcSource(source);
  if (source.type === 'restaurant_week') return scanRestaurantWeekSource(source);
  if (source.type === 'pitch_dining') return scanPitchDiningSource(source);
  if (source.type === 'kc_parks') return scanKcParksSource(source);
  if (source.type === 'kc_library') return scanKcLibrarySource(source);
  if (source.type === 'first_fridays') return scanFirstFridaysSource(source);
  if (source.type === 'estate_sales_net') return scanEstateSalesNetSource(source);
  if (source.type === 'estate_sales_org') return scanEstateSalesOrgSource(source);
  if (source.type === 'brown_button_estates') return scanBrownButtonEstatesSource(source);
  if (source.type === 'pitch_openings') return scanPitchOpeningsSource(source);
  if (source.type === 'inkc_openings') return scanInKcOpeningsSource(source);
  if (source.type === 'visitkc_openings') return scanVisitKcOpeningsSource(source);
  if (source.type === 'metro_openings') return scanMetroOpeningsSource(source);
  if (source.type === 'metro_deals') return scanMetroDealsSource(source);
  if (source.type === 'pitch_closings') return scanPitchClosingsSource(source);
  if (source.type === 'inkc_closings') return scanInKcClosingsSource(source);
  if (source.type === 'liquidation_sales_net') return scanLiquidationSalesNetSource(source);
  if (source.type === 'consignment_kc') return scanConsignmentKcSource(source);
  if (source.type === 'visitkc_luxury') return scanVisitKcLuxurySource(source);
  if (source.type === 'visitkc_romantic_weekends') return scanVisitKcRomanticWeekendsSource(source);
  if (source.type === 'visitkc_luxury_experiences') return scanVisitKcLuxuryExperiencesSource(source);
  if (source.type === 'kc_hotel_packages') return scanKcHotelPackagesSource(source);
  if (source.type === 'casino_hotel_packages') return scanCasinoHotelPackagesSource(source);
  if (source.type === 'spa_packages_kc') return scanSpaPackagesKcSource(source);
  if (source.type === 'rooftop_bars_kc') return scanRooftopBarsKcSource(source);
  if (source.type === 'wine_tasting_kc') return scanWineTastingKcSource(source);
  if (source.type === 'chef_tasting_menus') return scanChefTastingMenusSource(source);
  if (source.type === 'kauffman_date_nights') return scanKauffmanDateNightsSource(source);
  if (source.type === 'romantic_restaurant_events') return scanRomanticRestaurantEventsSource(source);
  if (source.type === 'big_slick_kc') return scanBigSlickKcSource(source);
  if (source.type === 'childrens_mercy_events') return scanChildrensMercyEventsSource(source);
  if (source.type === 'chiefs_charity_events') return scanChiefsCharityEventsSource(source);
  if (source.type === 'royals_charity_events') return scanRoyalsCharityEventsSource(source);
  if (source.type === 'sporting_kc_charity') return scanSportingKcCharitySource(source);
  if (source.type === 'kc_current_charity') return scanKcCurrentCharitySource(source);
  if (source.type === 'kauffman_charity_galas') return scanKauffmanCharityGalasSource(source);
  if (source.type === 'visitkc_charity_events') return scanVisitKcCharityEventsSource(source);
  if (source.type === 'kc_nonprofit_galas') return scanKcNonprofitGalasSource(source);
  if (source.type === 'kc_entertainment_charity') return scanKcEntertainmentCharitySource(source);
  if (source.type === 'country_club_plaza') return scanCountryClubPlazaSource(source);
  if (source.type === 'crown_center_retail') return scanCrownCenterRetailSource(source);
  if (source.type === 'corbin_park') return scanCorbinParkSource(source);
  if (source.type === 'prairiefire_retail') return scanPrairiefireRetailSource(source);
  if (source.type === 'town_center_plaza') return scanTownCenterPlazaSource(source);
  if (source.type === 'zona_rosa') return scanZonaRosaSource(source);
  if (source.type === 'legends_outlets') return scanLegendsOutletsSource(source);
  if (source.type === 'strawberry_swing') return scanStrawberrySwingSource(source);
  if (source.type === 'west_bottoms_vintage') return scanWestBottomsVintageSource(source);
  if (source.type === 'river_market_vendors') return scanRiverMarketVendorsSource(source);
  if (source.type === 'made_in_kc') return scanMadeInKcSource(source);
  if (source.type === 'cardshows_io') return scanCardshowsIoSource(source);
  if (source.type === 'collect_a_con') return scanCollectAConSource(source);
  if (source.type === 'planet_comicon') return scanPlanetComiconSource(source);
  if (source.type === 'scrape') return scanScrapeListingSource(source);
  throw new Error(`unsupported source type: ${source.type}`);
}

export async function scanSource(sourceId: string): Promise<ScanSourceResult> {
  const source = await db.query.sources.findFirst({ where: eq(sources.id, sourceId) });
  if (!source) throw new Error(`source not found: ${sourceId}`);
  if (!source.active) throw new Error(`source inactive: ${sourceId}`);
  return scanSourceByType(source);
}

export async function scanAllActiveSources(opts?: {
  campaignId?: string;
  sourceId?: string;
}): Promise<ScanAllResult> {
  if (!featureFlags.enableKcScanner) {
    throw new Error('ENABLE_KC_SCANNER is not enabled');
  }

  const allSources = await db
    .select()
    .from(sources)
    .where(eq(sources.active, true));

  let targets = allSources.filter(
    (s) =>
      s.type === 'reddit' ||
      s.type === 'visitkc' ||
      s.type === 'crossroads' ||
      s.type === 'union_station' ||
      s.type === 'kauffman' ||
      s.type === 'sporting_kc' ||
      s.type === 'restaurant_week' ||
      s.type === 'pitch_dining' ||
      s.type === 'kc_parks' ||
      s.type === 'kc_library' ||
      s.type === 'first_fridays' ||
      s.type === 'estate_sales_net' ||
      s.type === 'estate_sales_org' ||
      s.type === 'brown_button_estates' ||
      s.type === 'pitch_openings' ||
      s.type === 'inkc_openings' ||
      s.type === 'visitkc_openings' ||
      s.type === 'metro_openings' ||
      s.type === 'metro_deals' ||
      s.type === 'pitch_closings' ||
      s.type === 'inkc_closings' ||
      s.type === 'liquidation_sales_net' ||
      s.type === 'consignment_kc' ||
      s.type === 'visitkc_luxury' ||
      s.type === 'visitkc_romantic_weekends' ||
      s.type === 'visitkc_luxury_experiences' ||
      s.type === 'kc_hotel_packages' ||
      s.type === 'casino_hotel_packages' ||
      s.type === 'spa_packages_kc' ||
      s.type === 'rooftop_bars_kc' ||
      s.type === 'wine_tasting_kc' ||
      s.type === 'chef_tasting_menus' ||
      s.type === 'kauffman_date_nights' ||
      s.type === 'romantic_restaurant_events' ||
      s.type === 'big_slick_kc' ||
      s.type === 'childrens_mercy_events' ||
      s.type === 'chiefs_charity_events' ||
      s.type === 'royals_charity_events' ||
      s.type === 'sporting_kc_charity' ||
      s.type === 'kc_current_charity' ||
      s.type === 'kauffman_charity_galas' ||
      s.type === 'visitkc_charity_events' ||
      s.type === 'kc_nonprofit_galas' ||
      s.type === 'kc_entertainment_charity' ||
      s.type === 'country_club_plaza' ||
      s.type === 'crown_center_retail' ||
      s.type === 'corbin_park' ||
      s.type === 'prairiefire_retail' ||
      s.type === 'town_center_plaza' ||
      s.type === 'zona_rosa' ||
      s.type === 'legends_outlets' ||
      s.type === 'strawberry_swing' ||
      s.type === 'west_bottoms_vintage' ||
      s.type === 'river_market_vendors' ||
      s.type === 'made_in_kc' ||
      s.type === 'cardshows_io' ||
      s.type === 'collect_a_con' ||
      s.type === 'planet_comicon' ||
      s.type === 'scrape',
  );
  if (opts?.campaignId) {
    targets = targets.filter((s) => s.campaignId === opts.campaignId);
  }
  if (opts?.sourceId) {
    targets = targets.filter((s) => s.id === opts.sourceId);
  }

  const results: ScanSourceResult[] = [];
  for (const source of targets) {
    results.push(await scanSourceByType(source));
  }

  return {
    results,
    totalCreated: results.reduce((n, r) => n + r.itemsCreated, 0),
  };
}

export async function listIngestedContentIds(sourceId?: string): Promise<number> {
  const rows = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      sourceId
        ? and(eq(contentItems.sourceId, sourceId), isNotNull(contentItems.sourceExternalId))
        : isNotNull(contentItems.sourceId),
    );
  return rows.length;
}
