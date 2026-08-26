import { fetchPageContent } from '../ask-benson/listing-extract.js';
import {
  buildUserOpportunityExternalId,
  normalizeCanonicalEventUrl,
} from '../ask-benson/url-intake-dedupe.js';
import { persistUserConfirmedOpportunity } from '../ask-benson/user-opportunity-save.js';
import { setIngestDryRun, isIngestDryRun } from '../scanner/ingest-persist.js';
import type { NewContentItem } from '../schema.js';
import { parseEventbriteDetailPage } from './detail.js';
import {
  dedupeCatalogByEventId,
  extractEventbriteCatalogEntriesFromHtml,
  type ExtractedEventbriteCatalogEntry,
} from './extract.js';
import {
  defaultCampaignId,
  findExistingByEventbriteId,
  findTitleDateNearTwin,
  getOrCreateEventbriteKcSource,
  type ExistingEventTwin,
} from './source.js';
import {
  EVENTBRITE_KC_DISCOVERY_SURFACES,
  EVENTBRITE_KC_INGEST,
  EVENTBRITE_KC_MAX_DETAIL_FETCHES,
  EVENTBRITE_KC_MAX_SURFACES,
  EVENTBRITE_KC_MAX_UNIQUE_EVENT_IDS,
  type EventbriteDiscoverySurfaceId,
} from './surfaces.js';

export type SurfaceRunReport = {
  surfaceId: EventbriteDiscoverySurfaceId;
  url: string;
  fetchOk: boolean;
  httpError?: string;
  extractedIds: string[];
  extractedCount: number;
};

export type CandidateDisposition =
  | 'would_create'
  | 'would_update'
  | 'already_exists_eb'
  | 'cross_source_twin_no_merge'
  | 'rejected_geography'
  | 'rejected_qualify'
  | 'parser_failed'
  | 'detail_fetch_failed'
  | 'skipped_cap';

export type CandidateReport = {
  eventbriteEventId: string;
  url: string;
  surfaceId: EventbriteDiscoverySurfaceId;
  title?: string | null;
  eventDate?: string | null;
  venue?: string | null;
  city?: string | null;
  disposition: CandidateDisposition;
  durableExternalId: string;
  existingTwin?: ExistingEventTwin | null;
  rejectionCode?: string;
  rejectionReason?: string;
};

export type EventbriteKcDiscoveryResult = {
  ran: boolean;
  reason: string;
  dryRun: boolean;
  persist: boolean;
  surfaces: SurfaceRunReport[];
  uniqueIdsFound: number;
  duplicateIdsAcrossSurfaces: number;
  detailFetchAttempts: number;
  detailParsedOk: number;
  kcEligible: number;
  rejectedGeography: number;
  parserFailures: number;
  detailFetchFailures: number;
  alreadyExistingEb: number;
  crossSourceTwins: number;
  wouldCreate: number;
  wouldUpdate: number;
  created: number;
  updated: number;
  candidates: CandidateReport[];
};

export type RunEventbriteKcDiscoveryOptions = {
  /** When true (default for this task), never write durable rows. */
  dryRun?: boolean;
  /**
   * When false (default), skip persist even if dryRun is false.
   * Live writes require dryRun=false AND persist=true.
   */
  persist?: boolean;
  maxUniqueIds?: number;
  maxDetailFetches?: number;
  campaignId?: string;
  /** Inject HTML by surface for tests (skips network for that surface). */
  surfaceHtml?: Partial<Record<EventbriteDiscoverySurfaceId, string>>;
  /** Inject detail HTML by event id for tests. */
  detailHtmlByEventId?: Record<string, string>;
  /** Skip DB lookups (unit tests). */
  skipExistingLookup?: boolean;
};

async function fetchSurfaceHtml(
  surfaceId: EventbriteDiscoverySurfaceId,
  url: string,
  injected?: string,
): Promise<{ ok: boolean; html?: string; error?: string }> {
  if (injected != null) return { ok: true, html: injected };
  const page = await fetchPageContent(url);
  if (!page.ok || !page.html) return { ok: false, error: 'fetch_failed' };
  return { ok: true, html: page.html };
}

function buildPersistRow(input: {
  campaignId: string;
  sourceId: string;
  eventbriteEventId: string;
  url: string;
  title: string;
  summary?: string | null;
  venue?: string | null;
  location?: string | null;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  surfaceId: EventbriteDiscoverySurfaceId;
}): NewContentItem {
  const externalId = buildUserOpportunityExternalId({
    eventbriteEventId: input.eventbriteEventId,
  });
  return {
    campaignId: input.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: input.title.slice(0, 500),
    hook: 'Discovered from Eventbrite Kansas City public listing',
    script: input.summary?.slice(0, 4000) ?? null,
    sourceId: input.sourceId,
    sourceExternalId: externalId,
    sourceUrl: input.url,
    discoveredAt: new Date(),
    eventStartsAt: input.eventStartsAt,
    eventEndsAt: input.eventEndsAt,
    locationName: input.location?.trim() || input.venue?.trim() || null,
    relevanceScore: '0.7',
    urgencyScore: '0.5',
    metadata: {
      ingest: EVENTBRITE_KC_INGEST,
      eventbriteEventId: input.eventbriteEventId,
      canonicalEventUrl: input.url,
      discoverySurface: input.surfaceId,
      opportunityCategory: 'local_event',
    },
    rawPayload: {
      eventbriteEventId: input.eventbriteEventId,
      discoverySurface: input.surfaceId,
    },
  };
}

/**
 * First-class public Eventbrite Kansas City discovery.
 * City + category HTML → ItemList `/e/` URLs → detail JSON-LD → geo qualify → optional persist.
 * Does not use Eventbrite OAuth, /v3/events/search, or destination-search JSON.
 */
export async function runEventbriteKcDiscovery(
  opts: RunEventbriteKcDiscoveryOptions = {},
): Promise<EventbriteKcDiscoveryResult> {
  const dryRun = opts.dryRun !== false;
  const persist = opts.persist === true && !dryRun;
  const maxUniqueIds = Math.min(
    opts.maxUniqueIds ?? EVENTBRITE_KC_MAX_UNIQUE_EVENT_IDS,
    EVENTBRITE_KC_MAX_UNIQUE_EVENT_IDS,
  );
  const maxDetailFetches = Math.min(
    opts.maxDetailFetches ?? EVENTBRITE_KC_MAX_DETAIL_FETCHES,
    EVENTBRITE_KC_MAX_DETAIL_FETCHES,
  );

  const surfaces = EVENTBRITE_KC_DISCOVERY_SURFACES.slice(0, EVENTBRITE_KC_MAX_SURFACES);
  const surfaceReports: SurfaceRunReport[] = [];
  const allEntries: ExtractedEventbriteCatalogEntry[] = [];

  for (const surface of surfaces) {
    try {
      const fetched = await fetchSurfaceHtml(
        surface.id,
        surface.url,
        opts.surfaceHtml?.[surface.id],
      );
      if (!fetched.ok || !fetched.html) {
        surfaceReports.push({
          surfaceId: surface.id,
          url: surface.url,
          fetchOk: false,
          httpError: fetched.error ?? 'fetch_failed',
          extractedIds: [],
          extractedCount: 0,
        });
        continue;
      }
      const extracted = extractEventbriteCatalogEntriesFromHtml(fetched.html, surface.id);
      surfaceReports.push({
        surfaceId: surface.id,
        url: surface.url,
        fetchOk: true,
        extractedIds: extracted.map((e) => e.eventbriteEventId),
        extractedCount: extracted.length,
      });
      allEntries.push(...extracted);
    } catch (err) {
      surfaceReports.push({
        surfaceId: surface.id,
        url: surface.url,
        fetchOk: false,
        httpError: err instanceof Error ? err.message : String(err),
        extractedIds: [],
        extractedCount: 0,
      });
    }
  }

  const { unique, duplicateIds } = dedupeCatalogByEventId(allEntries);
  const capped = unique.slice(0, maxUniqueIds);

  let campaignId: string | null = null;
  let sourceId: string | null = null;
  if (persist || !opts.skipExistingLookup) {
    try {
      campaignId = opts.campaignId ?? (await defaultCampaignId());
      if (persist) {
        sourceId = await getOrCreateEventbriteKcSource(campaignId);
      }
    } catch {
      // Dry-run without DB still useful for catalog extraction.
      if (persist) throw new Error('Database required for Eventbrite KC persist');
    }
  }

  const prevDry = isIngestDryRun();
  if (dryRun || !persist) setIngestDryRun(true);

  const candidates: CandidateReport[] = [];
  let detailFetchAttempts = 0;
  let detailParsedOk = 0;
  let kcEligible = 0;
  let rejectedGeography = 0;
  let parserFailures = 0;
  let detailFetchFailures = 0;
  let alreadyExistingEb = 0;
  let crossSourceTwins = 0;
  let wouldCreate = 0;
  let wouldUpdate = 0;
  let created = 0;
  let updated = 0;

  try {
    const toFetch = capped.slice(0, maxDetailFetches);
    const skipped = capped.slice(maxDetailFetches);
    for (const entry of skipped) {
      candidates.push({
        eventbriteEventId: entry.eventbriteEventId,
        url: entry.url,
        surfaceId: entry.surfaceId,
        disposition: 'skipped_cap',
        durableExternalId: buildUserOpportunityExternalId({
          eventbriteEventId: entry.eventbriteEventId,
        }),
      });
    }

    const CONCURRENCY = 5;
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (entry) => {
          const parsed = await parseEventbriteDetailPage(entry.url, {
            html: opts.detailHtmlByEventId?.[entry.eventbriteEventId],
          });
          return { entry, parsed };
        }),
      );
      detailFetchAttempts += batch.length;

      for (const { entry, parsed } of batchResults) {
      const durableExternalId = buildUserOpportunityExternalId({
        eventbriteEventId: entry.eventbriteEventId,
      });

      if (!parsed.ok) {
        if (parsed.reason === 'fetch_failed') {
          detailFetchFailures += 1;
          candidates.push({
            eventbriteEventId: entry.eventbriteEventId,
            url: entry.url,
            surfaceId: entry.surfaceId,
            disposition: 'detail_fetch_failed',
            durableExternalId,
          });
        } else if (parsed.reason === 'qualify_rejected') {
          const code = parsed.qualification?.rejectionCode;
          if (code === 'out_of_market' || code === 'location_scope_mismatch') {
            rejectedGeography += 1;
            candidates.push({
              eventbriteEventId: entry.eventbriteEventId,
              url: entry.url,
              surfaceId: entry.surfaceId,
              title: parsed.opportunity?.title ?? entry.titleHint,
              disposition: 'rejected_geography',
              durableExternalId,
              rejectionCode: code,
              rejectionReason: parsed.qualification?.rejectionReason,
            });
          } else {
            parserFailures += 1;
            candidates.push({
              eventbriteEventId: entry.eventbriteEventId,
              url: entry.url,
              surfaceId: entry.surfaceId,
              disposition: 'rejected_qualify',
              durableExternalId,
              rejectionCode: code,
              rejectionReason: parsed.qualification?.rejectionReason,
            });
          }
        } else {
          parserFailures += 1;
          candidates.push({
            eventbriteEventId: entry.eventbriteEventId,
            url: entry.url,
            surfaceId: entry.surfaceId,
            disposition: 'parser_failed',
            durableExternalId,
            rejectionReason: parsed.reason,
          });
        }
        continue;
      }

      detailParsedOk += 1;
      kcEligible += 1;

      let existingTwin: ExistingEventTwin | null = null;
      if (!opts.skipExistingLookup && campaignId) {
        existingTwin = await findExistingByEventbriteId(entry.eventbriteEventId);
        if (!existingTwin) {
          existingTwin = await findTitleDateNearTwin({
            title: parsed.opportunity.title,
            eventStartsAt: parsed.eventStartsAt,
          });
        }
      }

      if (existingTwin?.matchKind === 'eventbrite_id' || existingTwin?.matchKind === 'external_id') {
        alreadyExistingEb += 1;
        wouldUpdate += 1;
        if (persist && sourceId && campaignId) {
          const row = buildPersistRow({
            campaignId,
            sourceId,
            eventbriteEventId: entry.eventbriteEventId,
            url: parsed.url,
            title: parsed.opportunity.title,
            summary: parsed.opportunity.summary,
            venue: parsed.opportunity.venue,
            location: parsed.opportunity.location,
            eventStartsAt: parsed.eventStartsAt,
            eventEndsAt: null,
            surfaceId: entry.surfaceId,
          });
          const result = await persistUserConfirmedOpportunity({
            sourceId,
            row,
            canonicalUrl: parsed.url,
            eventbriteEventId: entry.eventbriteEventId,
            userConfirmed: false,
          });
          if (result.outcome === 'updated') updated += 1;
          else created += 1;
        }
        candidates.push({
          eventbriteEventId: entry.eventbriteEventId,
          url: parsed.url,
          surfaceId: entry.surfaceId,
          title: parsed.opportunity.title,
          eventDate: parsed.opportunity.eventDate,
          venue: parsed.opportunity.venue,
          city: parsed.opportunity.city,
          disposition: persist ? 'would_update' : 'already_exists_eb',
          durableExternalId,
          existingTwin,
        });
        continue;
      }

      if (existingTwin?.matchKind === 'title_date_near') {
        crossSourceTwins += 1;
        // Limitation: do not invent cross-source merge/stamp in this task.
        candidates.push({
          eventbriteEventId: entry.eventbriteEventId,
          url: parsed.url,
          surfaceId: entry.surfaceId,
          title: parsed.opportunity.title,
          eventDate: parsed.opportunity.eventDate,
          venue: parsed.opportunity.venue,
          city: parsed.opportunity.city,
          disposition: 'cross_source_twin_no_merge',
          durableExternalId,
          existingTwin,
        });
        continue;
      }

      wouldCreate += 1;
      if (persist && sourceId && campaignId) {
        const row = buildPersistRow({
          campaignId,
          sourceId,
          eventbriteEventId: entry.eventbriteEventId,
          url: parsed.url,
          title: parsed.opportunity.title,
          summary: parsed.opportunity.summary,
          venue: parsed.opportunity.venue,
          location: parsed.opportunity.location,
          eventStartsAt: parsed.eventStartsAt,
          eventEndsAt: null,
          surfaceId: entry.surfaceId,
        });
        const result = await persistUserConfirmedOpportunity({
          sourceId,
          row,
          canonicalUrl: normalizeCanonicalEventUrl(parsed.url),
          eventbriteEventId: entry.eventbriteEventId,
          userConfirmed: false,
        });
        if (result.outcome === 'created') created += 1;
        else updated += 1;
      }

      candidates.push({
        eventbriteEventId: entry.eventbriteEventId,
        url: parsed.url,
        surfaceId: entry.surfaceId,
        title: parsed.opportunity.title,
        eventDate: parsed.opportunity.eventDate,
        venue: parsed.opportunity.venue,
        city: parsed.opportunity.city,
        disposition: 'would_create',
        durableExternalId,
      });
      }
    }
  } finally {
    setIngestDryRun(prevDry);
  }

  return {
    ran: true,
    reason: dryRun || !persist ? 'dry_run_complete' : 'persisted',
    dryRun: dryRun || !persist,
    persist,
    surfaces: surfaceReports,
    uniqueIdsFound: unique.length,
    duplicateIdsAcrossSurfaces: duplicateIds.length,
    detailFetchAttempts,
    detailParsedOk,
    kcEligible,
    rejectedGeography,
    parserFailures,
    detailFetchFailures,
    alreadyExistingEb,
    crossSourceTwins,
    wouldCreate,
    wouldUpdate,
    created,
    updated,
    candidates,
  };
}
