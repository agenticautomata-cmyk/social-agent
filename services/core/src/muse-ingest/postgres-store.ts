/**
 * Postgres routing into the existing calendar, opportunity, and openings paths.
 * Muse never sends outreach and never confirms calendar items.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, museIngestItems, museIngestRuns, openingLocations, sources } from '../schema.js';
import { computeLifecycleStatus } from '../creator-agent/lifecycle.js';
import { persistIngestedContentItemResult } from '../scanner/ingest-persist.js';
import { persistOpeningEntry } from '../openings-radar/persist.js';
import type { OpeningLifecycleStatus, ParsedOpeningEntry } from '../openings-radar/types.js';
import {
  admissionMetadata,
  decideEventAdmission,
  dossierCanonicalUrl,
  eventCanonicalUrl,
  museEventCandidate,
  openingEvidenceUrl,
  storedContactRoutes,
  storedDossierFacts,
} from './contract.js';
import type {
  DossierRouteInput,
  EventRouteInput,
  MuseIngestStore,
  MuseRouteOutcome,
  OpeningRouteInput,
  StoredMuseItem,
} from './types.js';

const SOURCE_NAME = 'Muse Agent';

async function defaultCampaignId(): Promise<string> {
  const row = await db.query.campaigns.findFirst({ where: eq(campaigns.active, true) });
  if (!row) throw new Error('no active campaign');
  return row.id;
}

async function getOrCreateSourceId(campaignId: string): Promise<string> {
  const existing = await db.query.sources.findFirst({
    where: and(eq(sources.campaignId, campaignId), eq(sources.name, SOURCE_NAME)),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(sources)
    .values({
      campaignId,
      type: 'manual',
      name: SOURCE_NAME,
      config: { ingest: 'muse-agent' },
      active: true,
    })
    .returning({ id: sources.id });
  return created!.id;
}

function provenanceBlock(item: { fingerprint: string; provenance: { found_via: string; found_at: string; evidence_urls: string[] } }, sourceUrl: string | null) {
  return {
    found_via: item.provenance.found_via,
    found_at: item.provenance.found_at,
    sourceUrl,
    evidence_urls: item.provenance.evidence_urls,
    fingerprint: item.fingerprint,
    source: 'muse-agent',
  };
}

export function createPostgresMuseIngestStore(): MuseIngestStore {
  return {
    async beginRun(input) {
      const [row] = await db
        .insert(museIngestRuns)
        .values({
          itemCount: input.itemCount,
          rawPayload: input.rawPayload as object,
          status: 'running',
        })
        .returning({ id: museIngestRuns.id });
      return { id: row!.id };
    },
    async completeRun(id, dispositions, status, error) {
      await db
        .update(museIngestRuns)
        .set({
          dispositions,
          status,
          error: error ?? null,
          completedAt: new Date(),
        })
        .where(eq(museIngestRuns.id, id));
    },
    async findItem(source, fingerprint): Promise<StoredMuseItem | null> {
      const [row] = await db
        .select({
          source: museIngestItems.source,
          fingerprint: museIngestItems.fingerprint,
          disposition: museIngestItems.disposition,
          reason: museIngestItems.reason,
          routedKind: museIngestItems.routedKind,
          routedId: museIngestItems.routedId,
        })
        .from(museIngestItems)
        .where(and(eq(museIngestItems.source, source), eq(museIngestItems.fingerprint, fingerprint)))
        .limit(1);
      if (!row) return null;
      return {
        source: row.source,
        fingerprint: row.fingerprint,
        disposition: row.disposition as StoredMuseItem['disposition'],
        reason: row.reason,
        routedKind: row.routedKind,
        routedId: row.routedId,
      };
    },
    async commitItem(row) {
      const inserted = await db
        .insert(museIngestItems)
        .values({
          runId: row.runId,
          source: row.source,
          fingerprint: row.fingerprint,
          itemType: row.itemType,
          disposition: row.disposition,
          reason: row.reason,
          canonicalUrl: row.canonicalUrl,
          rawItem: row.rawItem as object,
          routedKind: row.routedKind,
          routedId: row.routedId,
        })
        .onConflictDoNothing({
          target: [museIngestItems.source, museIngestItems.fingerprint],
        })
        .returning({ id: museIngestItems.id });
      return inserted[0] ? 'inserted' : 'conflict';
    },
    routeEvent,
    routeDossier,
    routeOpening,
  };
}

async function routeEvent(input: EventRouteInput): Promise<MuseRouteOutcome> {
  const canonicalUrl = eventCanonicalUrl(input.item);
  const admission = decideEventAdmission(input.item, input.now);
  if (admission.disposition === 'rejected') {
    return {
      disposition: 'rejected',
      reason: admission.reason,
      routedKind: null,
      routedId: null,
      canonicalUrl,
    };
  }
  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateSourceId(campaignId);
  const candidate = museEventCandidate(input.item, input.now);
  const externalId = `muse-agent:${input.item.fingerprint}`;
  const starts = new Date(String(input.item.raw.starts_at));
  const ends = typeof input.item.raw.ends_at === 'string' ? new Date(input.item.raw.ends_at) : null;
  const locationName = candidate.venue ?? candidate.locationName ?? candidate.neighborhood ?? null;
  const outcome = await persistIngestedContentItemResult(
    sourceId,
    externalId,
    () => ({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: candidate.title,
      hook: candidate.title,
      script: candidate.description ?? candidate.title,
      sourceId,
      sourceExternalId: externalId,
      sourceUrl: canonicalUrl,
      discoveredAt: new Date(input.item.provenance.found_at),
      eventStartsAt: starts,
      eventEndsAt: ends,
      locationName,
      formattedAddress: candidate.formattedAddress,
      creatorValueStatus: admission.disposition === 'accepted' ? 'creator_candidate' : 'hidden_raw_signal',
      lifecycleStatus: computeLifecycleStatus(
        {
          title: candidate.title,
          eventStartsAt: starts,
          eventEndsAt: ends,
          discoveredAt: new Date(input.item.provenance.found_at),
        },
        input.now,
      ),
      metadata: {
        ingest: 'muse-agent',
        source: 'muse-agent',
        opportunityCategory: 'community_event',
        calendarEligible: admission.disposition === 'accepted',
        autoOutreach: false,
        autoPitch: false,
        reviewOnly: true,
        inventoryStatus: 'unreviewed',
        provenance: provenanceBlock(input.item, canonicalUrl),
        extracted: {
          eventDate: candidate.eventDate,
          venue: candidate.venue ?? null,
        },
        ...admissionMetadata(admission.decision),
      },
      rawPayload: input.item.raw,
    }),
    { sourceUrl: canonicalUrl ?? undefined },
  );
  if (outcome.outcome === 'updated') {
    return {
      disposition: 'merged_duplicate',
      reason: 'canonical_url_match',
      routedKind: 'content_item',
      routedId: outcome.contentItemId,
      canonicalUrl,
    };
  }
  return {
    disposition: admission.disposition,
    reason: admission.reason,
    routedKind: 'content_item',
    routedId: outcome.contentItemId,
    canonicalUrl,
  };
}

async function routeDossier(input: DossierRouteInput): Promise<MuseRouteOutcome> {
  const canonicalUrl = dossierCanonicalUrl(input.item);
  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateSourceId(campaignId);
  const business = String(input.item.raw.business).trim();
  const externalId = `muse-agent:${input.item.fingerprint}`;
  const facts = storedDossierFacts(input.item);
  const contactRoutes = storedContactRoutes(input.item);
  const fit = typeof input.item.raw.fit_assessment === 'string' ? input.item.raw.fit_assessment : null;
  const outcome = await persistIngestedContentItemResult(
    sourceId,
    externalId,
    () => ({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: business,
      hook: business,
      script: fit,
      sourceId,
      sourceExternalId: externalId,
      sourceUrl: canonicalUrl,
      discoveredAt: new Date(input.item.provenance.found_at),
      eventStartsAt: null,
      eventEndsAt: null,
      locationName: null,
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
      metadata: {
        ingest: 'muse-agent',
        source: 'muse-agent',
        opportunityLayer: 'opportunity',
        inventoryStatus: 'suggested',
        reviewQueue: 'opportunities',
        autoOutreach: false,
        autoPitch: false,
        reviewOnly: true,
        calendarEligible: false,
        verificationNote: 'Payload claims only. Benson did not re-verify.',
        museDossier: {
          business,
          facts,
          contact_routes: contactRoutes,
          fit_assessment: fit,
        },
        provenance: provenanceBlock(input.item, canonicalUrl),
      },
      rawPayload: input.item.raw,
    }),
    { sourceUrl: canonicalUrl ?? undefined },
  );
  if (outcome.outcome === 'updated') {
    return {
      disposition: 'merged_duplicate',
      reason: 'canonical_url_match',
      routedKind: 'content_item',
      routedId: outcome.contentItemId,
      canonicalUrl,
    };
  }
  return {
    disposition: 'accepted',
    reason: 'queued_for_review',
    routedKind: 'content_item',
    routedId: outcome.contentItemId,
    canonicalUrl,
  };
}

function openingEntry(input: OpeningRouteInput): ParsedOpeningEntry {
  const business = String(input.item.raw.business).trim();
  const location = typeof input.item.raw.location === 'string' ? input.item.raw.location.trim() : null;
  const stage = String(input.item.raw.stage).trim() as OpeningLifecycleStatus;
  const projected =
    typeof input.item.raw.projected_open === 'string' ? input.item.raw.projected_open.trim() : null;
  const evidenceUrl = openingEvidenceUrl(input.item);
  const evidenceText = [business, location, stage, evidenceUrl, input.item.provenance.found_via, input.item.provenance.found_at]
    .filter((part): part is string => Boolean(part))
    .join(' | ');
  const unknownDate = { label: null, exactDate: null, precision: 'unknown' as const };
  return {
    businessName: business,
    parentBrand: null,
    isLocalIndependent: null,
    isChain: null,
    category: null,
    description: null,
    streetAddress: null,
    suite: null,
    city: null,
    state: null,
    zip: null,
    neighborhood: location,
    status: stage,
    estimatedOpening: projected
      ? { label: projected, exactDate: projected, precision: 'exact' }
      : unknownDate,
    grandOpening: unknownDate,
    softOpening: unknownDate,
    relocationStatus: null,
    expansionStatus: null,
    formerLocation: null,
    formerTenant: null,
    additionalLocationsPlanned: null,
    evidenceText,
    confidence: 0,
    fieldConfidence: {},
  };
}

async function routeOpening(input: OpeningRouteInput): Promise<MuseRouteOutcome> {
  const evidenceUrl = openingEvidenceUrl(input.item);
  const entry = openingEntry(input);
  const persisted = await persistOpeningEntry({
    entry,
    provenance: {
      monitoredSource: 'muse-agent',
      canonicalArticleUrl: evidenceUrl,
      publicationDate: input.item.provenance.found_at,
      sourceFingerprint: input.item.fingerprint,
      extractedAt: input.item.provenance.found_at,
      channel: 'manual',
    },
    createOpportunity: false,
    createEvent: false,
  });
  const [location] = await db
    .select()
    .from(openingLocations)
    .where(eq(openingLocations.id, persisted.locationId))
    .limit(1);
  if (location) {
    const priorMeta = (location.metadata ?? {}) as Record<string, unknown>;
    const museProvenance = provenanceBlock(input.item, evidenceUrl);
    if (persisted.created) {
      const projected =
        typeof input.item.raw.projected_open === 'string' ? input.item.raw.projected_open.trim() : null;
      await db
        .update(openingLocations)
        .set({
          verificationLevel: 'unverified',
          creatorFitScore: null,
          recommendedNextAction: 'Review on Openings Radar before any contact.',
          sourceFingerprint: input.item.fingerprint,
          sourceUrl: evidenceUrl,
          metadata: { ...priorMeta, museProvenance, autoOutreach: false },
          research: {
            officialName: { value: entry.businessName, label: 'unverified_lead' },
            estimatedOpening: {
              value: projected,
              label: projected ? 'unverified_lead' : 'not_found',
            },
            website: { value: null, label: 'not_found' },
            phone: { value: null, label: 'not_found' },
            publicEmail: { value: null, label: 'not_found' },
            contactForm: { value: null, label: 'not_found' },
            autoOutreach: false,
            note: 'Muse payload stored as given. Not verified. No outreach.',
          },
          updatedAt: new Date(),
        })
        .where(eq(openingLocations.id, location.id));
    } else {
      await db
        .update(openingLocations)
        .set({
          metadata: { ...priorMeta, museProvenance, autoOutreach: false },
          updatedAt: new Date(),
        })
        .where(eq(openingLocations.id, location.id));
    }
  }
  if (persisted.duplicateMerged) {
    return {
      disposition: 'merged_duplicate',
      reason: 'canonical_location_match',
      routedKind: 'opening_location',
      routedId: persisted.locationId,
      canonicalUrl: evidenceUrl,
    };
  }
  return {
    disposition: 'accepted',
    reason: 'openings_radar',
    routedKind: 'opening_location',
    routedId: persisted.locationId,
    canonicalUrl: evidenceUrl,
  };
}
