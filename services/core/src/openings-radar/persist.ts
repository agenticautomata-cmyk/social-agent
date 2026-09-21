import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  campaigns,
  contentItems,
  creatorCalendarItems,
  openingAlerts,
  openingBusinesses,
  openingEvidence,
  openingLocations,
  openingStatusTransitions,
  sources,
} from '../schema.js';
import { buildLocationKey, businessKeysLikelySame, normalizeOpeningBusinessKey } from './identity.js';
import { mergeLifecycleStatus, shouldRecordStatusTransition } from './lifecycle.js';
import { decideEventPromotion, decideOpportunityPromotion } from './promote.js';
import type {
  OpeningPersistDecision,
  OpeningSourceProvenance,
  ParsedOpeningEntry,
} from './types.js';

const SOURCE_NAME = 'Openings Radar';
const VERONICA_BEARD_OPPORTUNITY_ID = '1315fdc4-0d60-44bb-a9a0-3e3fb5f74902';

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
      config: { ingest: 'openings_radar' },
      active: true,
    })
    .returning({ id: sources.id });
  return created!.id;
}

async function findOrCreateBusiness(entry: ParsedOpeningEntry): Promise<{ id: string; created: boolean }> {
  const key = normalizeOpeningBusinessKey(entry.businessName);
  const existing = await db.query.openingBusinesses.findFirst({
    where: eq(openingBusinesses.normalizedKey, key),
  });
  if (existing) {
    // Soft-match upgrade: longer canonical name wins if human hasn't locked
    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    if (!meta.humanEditedName && entry.businessName.length > existing.canonicalName.length) {
      if (businessKeysLikelySame(existing.canonicalName, entry.businessName)) {
        await db
          .update(openingBusinesses)
          .set({
            canonicalName: entry.businessName,
            category: entry.category ?? existing.category,
            description: entry.description ?? existing.description,
            isLocalIndependent: entry.isLocalIndependent ?? existing.isLocalIndependent,
            isChain: entry.isChain ?? existing.isChain,
            updatedAt: new Date(),
          })
          .where(eq(openingBusinesses.id, existing.id));
      }
    }
    return { id: existing.id, created: false };
  }

  // Soft match against existing keys (Charlie D's vs Charlie Ds Seafood...)
  const all = await db.select().from(openingBusinesses).limit(500);
  const soft = all.find((b) => businessKeysLikelySame(b.canonicalName, entry.businessName));
  if (soft) return { id: soft.id, created: false };

  const [created] = await db
    .insert(openingBusinesses)
    .values({
      canonicalName: entry.businessName,
      normalizedKey: key,
      parentBrand: entry.parentBrand,
      isLocalIndependent: entry.isLocalIndependent,
      isChain: entry.isChain,
      category: entry.category,
      description: entry.description,
      metadata: {},
    })
    .returning({ id: openingBusinesses.id });
  return { id: created!.id, created: true };
}

function formatAddress(entry: ParsedOpeningEntry): string | null {
  const parts = [
    entry.streetAddress,
    entry.suite ? `Suite ${entry.suite}` : null,
    entry.city,
    entry.state,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function seedResearch(entry: ParsedOpeningEntry) {
  const label = 'editorial_supported';
  return {
    officialName: { value: entry.businessName, label },
    category: { value: entry.category, label },
    address: { value: formatAddress(entry), label },
    estimatedOpening: { value: entry.estimatedOpening.label, label },
    exactOpeningDate: { value: entry.estimatedOpening.exactDate, label },
    grandOpeningDate: { value: entry.grandOpening.exactDate ?? entry.grandOpening.label, label },
    softOpening: { value: entry.softOpening.label, label },
    website: { value: null, label: 'not_found' },
    phone: { value: null, label: 'not_found' },
    publicEmail: { value: null, label: 'not_found' },
    contactForm: { value: null, label: 'not_found' },
    socialProfiles: { value: null, label: 'not_found' },
    hours: { value: null, label: 'not_found' },
    prContact: { value: null, label: 'not_found' },
    creatorProgram: { value: null, label: 'not_found' },
    autoOutreach: false,
    note: 'Seeded from editorial evidence only. Contacts not invented.',
  };
}

async function ensureOpportunity(input: {
  entry: ParsedOpeningEntry;
  locationId: string;
  provenance: OpeningSourceProvenance;
  opportunityType: string;
  existingOpportunityId: string | null;
  dryRun?: boolean;
}): Promise<string | null> {
  if (input.existingOpportunityId) return input.existingOpportunityId;
  if (input.dryRun) return 'dry-run-opportunity';

  // Never recreate Veronica Beard
  const vb = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, VERONICA_BEARD_OPPORTUNITY_ID),
  });
  if (vb && /veronica beard/i.test(input.entry.businessName)) {
    return VERONICA_BEARD_OPPORTUNITY_ID;
  }

  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateSourceId(campaignId);
  const addr = formatAddress(input.entry);
  const dedupeKey = `openings-radar-opp:${normalizeOpeningBusinessKey(input.entry.businessName)}:${buildLocationKey({
    businessName: input.entry.businessName,
    streetAddress: input.entry.streetAddress,
    suite: input.entry.suite,
    city: input.entry.city,
    state: input.entry.state,
    neighborhood: input.entry.neighborhood,
  })}`;

  const existing = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(eq(contentItems.sourceExternalId, dedupeKey))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const topic = `${input.entry.businessName} — ${input.opportunityType.replace(/_/g, ' ')}${
    input.entry.neighborhood || input.entry.city
      ? ` · ${input.entry.neighborhood ?? input.entry.city}`
      : ''
  }`;

  const [inserted] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic,
      hook: `${input.entry.businessName} opening lead from Openings Radar`,
      script: input.entry.evidenceText,
      sourceId,
      sourceExternalId: dedupeKey,
      sourceUrl: input.provenance.canonicalArticleUrl,
      discoveredAt: new Date(),
      eventStartsAt: null,
      eventEndsAt: null,
      locationName: input.entry.neighborhood ?? input.entry.city,
      formattedAddress: addr,
      metadata: {
        ingest: 'openings_radar',
        opportunityLayer: 'opportunity',
        opportunityType: input.opportunityType,
        opportunityCategory: 'business_opening',
        newsletterDestination: 'opportunity',
        calendarEligible: false,
        autoOutreach: false,
        openingLocationId: input.locationId,
        businessName: input.entry.businessName,
        openingsRadar: {
          estimatedOpening: input.entry.estimatedOpening,
          grandOpening: input.entry.grandOpening,
          status: input.entry.status,
        },
        provenance: {
          gmailMessageIds: input.provenance.gmailMessageId ? [input.provenance.gmailMessageId] : [],
          articleUrls: input.provenance.canonicalArticleUrl ? [input.provenance.canonicalArticleUrl] : [],
          sourceFingerprint: input.provenance.sourceFingerprint,
        },
      },
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      sourceLastCheckedAt: new Date(),
      stale: false,
      freshnessBucket: 'fresh',
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
    })
    .returning({ id: contentItems.id });

  return inserted!.id;
}

async function ensureEvent(input: {
  entry: ParsedOpeningEntry;
  locationId: string;
  provenance: OpeningSourceProvenance;
  eventDate: string;
  eventTitle: string;
  existingCalendarId: string | null;
  dryRun?: boolean;
}): Promise<string | null> {
  if (input.existingCalendarId) return input.existingCalendarId;
  if (input.dryRun) return 'dry-run-event';

  const idempotencyKey = `openings-radar-event:${input.locationId}:${input.eventDate}`;
  const existing = await db.query.creatorCalendarItems.findFirst({
    where: eq(creatorCalendarItems.idempotencyKey, idempotencyKey),
  });
  if (existing) return existing.id;

  const startAt = new Date(`${input.eventDate}T17:00:00-05:00`);
  const [inserted] = await db
    .insert(creatorCalendarItems)
    .values({
      title: input.eventTitle,
      description: `Openings Radar grand-opening / public opening candidate. ${input.entry.evidenceText.slice(0, 400)}`,
      itemType: 'public_event',
      sourceRecordType: 'opening_location',
      sourceRecordId: input.locationId,
      sourceUrl: input.provenance.canonicalArticleUrl,
      startAt,
      endAt: null,
      allDay: true,
      timezone: 'America/Chicago',
      location: formatAddress(input.entry),
      status: 'tentative',
      planningStatus: 'tentative',
      createdBy: 'benson',
      idempotencyKey,
      occurrenceFingerprint: idempotencyKey,
      confidence: '0.700',
      verificationState: 'editorial_supported',
      populationSource: 'openings_radar',
      calendarIntent: 'public_opening_occasion',
      metadata: {
        openingsRadar: true,
        autoOutreach: false,
        evidence: input.entry.evidenceText.slice(0, 300),
        gmailMessageId: input.provenance.gmailMessageId,
      },
    })
    .returning({ id: creatorCalendarItems.id });

  return inserted!.id;
}

async function maybeAlert(input: {
  locationId: string;
  alertType: string;
  fingerprint: string;
  payload: Record<string, unknown>;
  dryRun?: boolean;
}): Promise<boolean> {
  if (input.dryRun) return false;
  const existing = await db
    .select({ id: openingAlerts.id })
    .from(openingAlerts)
    .where(eq(openingAlerts.fingerprint, input.fingerprint))
    .limit(1);
  if (existing[0]) return false;
  await db.insert(openingAlerts).values({
    locationId: input.locationId,
    alertType: input.alertType,
    fingerprint: input.fingerprint,
    payload: input.payload,
  });
  return true;
}

export async function persistOpeningEntry(input: {
  entry: ParsedOpeningEntry;
  provenance: OpeningSourceProvenance;
  dryRun?: boolean;
  createOpportunity?: boolean;
  createEvent?: boolean;
}): Promise<OpeningPersistDecision & { alertCreated: boolean }> {
  const { entry, provenance } = input;
  const locationKey = buildLocationKey({
    businessName: entry.businessName,
    streetAddress: entry.streetAddress,
    suite: entry.suite,
    city: entry.city,
    state: entry.state,
    neighborhood: entry.neighborhood,
  });

  const oppDecision = decideOpportunityPromotion(entry);
  const eventDecision = decideEventPromotion(entry);

  if (input.dryRun) {
    return {
      locationId: 'dry-run',
      businessId: 'dry-run',
      created: true,
      updated: false,
      duplicateMerged: false,
      businessName: entry.businessName,
      status: entry.status,
      opportunityDecision: oppDecision.shouldCreate
        ? `create:${oppDecision.opportunityType}:${oppDecision.reason}`
        : `skip:${oppDecision.reason}`,
      eventDecision: eventDecision.shouldCreate
        ? `create:${eventDecision.eventDate}:${eventDecision.reason}`
        : `skip:${eventDecision.reason}`,
      opportunityContentItemId: null,
      calendarItemId: null,
      alertCreated: false,
    };
  }

  const biz = await findOrCreateBusiness(entry);
  const existingLoc = await db.query.openingLocations.findFirst({
    where: and(eq(openingLocations.businessId, biz.id), eq(openingLocations.locationKey, locationKey)),
  });

  let locationId: string;
  let created = false;
  let updated = false;
  let duplicateMerged = false;

  if (existingLoc) {
    locationId = existingLoc.id;
    duplicateMerged = true;
    updated = true;

    // Preserve human edits
    const human = (existingLoc.humanEditedFields ?? {}) as Record<string, unknown>;
    const nextStatus = human.status
      ? (existingLoc.status as typeof entry.status)
      : mergeLifecycleStatus(existingLoc.status as typeof entry.status, entry.status);

    if (shouldRecordStatusTransition(existingLoc.status as typeof entry.status, nextStatus)) {
      await db.insert(openingStatusTransitions).values({
        locationId,
        fromStatus: existingLoc.status,
        toStatus: nextStatus,
        evidence: entry.evidenceText.slice(0, 400),
        source: provenance.channel,
      });
    }

    // Date conflict retention
    const meta = { ...(existingLoc.metadata as Record<string, unknown>) };
    const priorLabel = existingLoc.estimatedOpeningLabel;
    const nextLabel = human.estimatedOpeningLabel
      ? existingLoc.estimatedOpeningLabel
      : entry.estimatedOpening.label ?? existingLoc.estimatedOpeningLabel;
    if (
      priorLabel &&
      entry.estimatedOpening.label &&
      priorLabel !== entry.estimatedOpening.label &&
      !human.estimatedOpeningLabel
    ) {
      const history = Array.isArray(meta.dateClaimHistory) ? [...(meta.dateClaimHistory as unknown[])] : [];
      history.push({
        prior: priorLabel,
        next: entry.estimatedOpening.label,
        at: new Date().toISOString(),
        source: provenance.canonicalArticleUrl ?? provenance.gmailMessageId,
      });
      meta.dateClaimHistory = history.slice(-20);
      // Prefer more precise incoming date
      if (
        entry.estimatedOpening.precision === 'exact' ||
        (entry.estimatedOpening.precision === 'approximate' &&
          existingLoc.exactOpeningDate == null &&
          !entry.estimatedOpening.exactDate)
      ) {
        // keep nextLabel as incoming
      }
    }

    await db
      .update(openingLocations)
      .set({
        status: nextStatus,
        estimatedOpeningLabel: nextLabel,
        exactOpeningDate: human.exactOpeningDate
          ? existingLoc.exactOpeningDate
          : entry.estimatedOpening.exactDate != null
            ? entry.estimatedOpening.exactDate
            : entry.estimatedOpening.precision === 'approximate' ||
                entry.estimatedOpening.precision === 'vague'
              ? null // clear previously invented exact when source is approximate
              : existingLoc.exactOpeningDate,
        grandOpeningDate: human.grandOpeningDate
          ? existingLoc.grandOpeningDate
          : entry.grandOpening.exactDate ?? existingLoc.grandOpeningDate,
        softOpeningDate: entry.softOpening.exactDate ?? existingLoc.softOpeningDate,
        plannedDate: entry.estimatedOpening.exactDate ?? existingLoc.plannedDate,
        revisedDate:
          entry.estimatedOpening.exactDate &&
          existingLoc.exactOpeningDate &&
          entry.estimatedOpening.exactDate !== existingLoc.exactOpeningDate
            ? entry.estimatedOpening.exactDate
            : existingLoc.revisedDate,
        relocationStatus: entry.relocationStatus ?? existingLoc.relocationStatus,
        expansionStatus: entry.expansionStatus ?? existingLoc.expansionStatus,
        formerLocation: entry.formerLocation ?? existingLoc.formerLocation,
        formerTenant: entry.formerTenant ?? existingLoc.formerTenant,
        additionalLocationsPlanned:
          entry.additionalLocationsPlanned ?? existingLoc.additionalLocationsPlanned,
        streetAddress: human.streetAddress ? existingLoc.streetAddress : entry.streetAddress ?? existingLoc.streetAddress,
        suite: entry.suite ?? existingLoc.suite,
        city: entry.city ?? existingLoc.city,
        state: entry.state ?? existingLoc.state,
        neighborhood: entry.neighborhood ?? existingLoc.neighborhood,
        sourceTitle: provenance.articleTitle ?? existingLoc.sourceTitle,
        sourceAuthor: provenance.author ?? existingLoc.sourceAuthor,
        sourceUrl: provenance.canonicalArticleUrl ?? existingLoc.sourceUrl,
        sourcePublishedAt: provenance.publicationDate
          ? new Date(provenance.publicationDate)
          : existingLoc.sourcePublishedAt,
        sourceFingerprint: provenance.sourceFingerprint,
        gmailMessageId: provenance.gmailMessageId ?? existingLoc.gmailMessageId,
        socialPostUrl: provenance.socialPostUrl ?? existingLoc.socialPostUrl,
        lastConfirmedAt: new Date(),
        opportunityDecision: oppDecision.shouldCreate
          ? `create:${oppDecision.opportunityType}:${oppDecision.reason}`
          : `skip:${oppDecision.reason}`,
        eventDecision: eventDecision.shouldCreate
          ? `create:${eventDecision.eventDate}:${eventDecision.reason}`
          : `skip:${eventDecision.reason}`,
        metadata: meta,
        updatedAt: new Date(),
      })
      .where(eq(openingLocations.id, locationId));

    await db.insert(openingEvidence).values({
      locationId,
      field: 'update',
      excerpt: entry.evidenceText.slice(0, 500),
      sourceKind: provenance.channel,
      sourceUrl: provenance.canonicalArticleUrl,
      gmailMessageId: provenance.gmailMessageId,
      confidence: String(entry.confidence),
    });
  } else {
    created = true;
    const research = seedResearch(entry);
    const [inserted] = await db
      .insert(openingLocations)
      .values({
        businessId: biz.id,
        locationKey,
        streetAddress: entry.streetAddress,
        suite: entry.suite,
        city: entry.city,
        state: entry.state,
        zip: entry.zip,
        neighborhood: entry.neighborhood,
        status: entry.status,
        estimatedOpeningLabel: entry.estimatedOpening.label,
        exactOpeningDate: entry.estimatedOpening.exactDate,
        grandOpeningDate: entry.grandOpening.exactDate,
        softOpeningDate: entry.softOpening.exactDate,
        plannedDate: entry.estimatedOpening.exactDate,
        relocationStatus: entry.relocationStatus,
        expansionStatus: entry.expansionStatus,
        formerLocation: entry.formerLocation,
        formerTenant: entry.formerTenant,
        additionalLocationsPlanned: entry.additionalLocationsPlanned,
        verificationLevel: 'editorial_supported',
        creatorFitScore: oppDecision.shouldCreate ? '0.720' : '0.400',
        recommendedNextAction: oppDecision.shouldCreate
          ? 'Review Openings Radar card; research contacts before any outreach.'
          : 'Retain on Openings Radar; re-check for opening-date confirmation.',
        sourceTitle: provenance.articleTitle,
        sourceAuthor: provenance.author,
        sourceUrl: provenance.canonicalArticleUrl,
        sourcePublishedAt: provenance.publicationDate ? new Date(provenance.publicationDate) : null,
        sourceFingerprint: provenance.sourceFingerprint,
        gmailMessageId: provenance.gmailMessageId,
        socialPostUrl: provenance.socialPostUrl,
        research,
        fieldLabels: {
          address: 'editorial_supported',
          openingDate: 'editorial_supported',
          contacts: 'not_found',
        },
        opportunityDecision: oppDecision.shouldCreate
          ? `create:${oppDecision.opportunityType}:${oppDecision.reason}`
          : `skip:${oppDecision.reason}`,
        eventDecision: eventDecision.shouldCreate
          ? `create:${eventDecision.eventDate}:${eventDecision.reason}`
          : `skip:${eventDecision.reason}`,
        metadata: { firstEvidence: entry.evidenceText.slice(0, 300) },
      })
      .returning({ id: openingLocations.id });
    locationId = inserted!.id;

    await db.insert(openingStatusTransitions).values({
      locationId,
      fromStatus: null,
      toStatus: entry.status,
      evidence: entry.evidenceText.slice(0, 400),
      source: provenance.channel,
    });

    await db.insert(openingEvidence).values({
      locationId,
      field: 'discovery',
      excerpt: entry.evidenceText.slice(0, 500),
      sourceKind: provenance.channel,
      sourceUrl: provenance.canonicalArticleUrl,
      gmailMessageId: provenance.gmailMessageId,
      confidence: String(entry.confidence),
    });
  }

  const loc = await db.query.openingLocations.findFirst({ where: eq(openingLocations.id, locationId) });
  let opportunityContentItemId = loc?.opportunityContentItemId ?? null;
  let calendarItemId = loc?.calendarItemId ?? null;

  if (input.createOpportunity !== false && oppDecision.shouldCreate && oppDecision.opportunityType) {
    opportunityContentItemId = await ensureOpportunity({
      entry,
      locationId,
      provenance,
      opportunityType: oppDecision.opportunityType,
      existingOpportunityId: opportunityContentItemId,
      dryRun: input.dryRun,
    });
  }

  if (input.createEvent !== false && eventDecision.shouldCreate && eventDecision.eventDate && eventDecision.eventTitle) {
    calendarItemId = await ensureEvent({
      entry,
      locationId,
      provenance,
      eventDate: eventDecision.eventDate,
      eventTitle: eventDecision.eventTitle,
      existingCalendarId: calendarItemId,
      dryRun: input.dryRun,
    });
  }

  if (opportunityContentItemId || calendarItemId) {
    await db
      .update(openingLocations)
      .set({
        opportunityContentItemId,
        calendarItemId,
        updatedAt: new Date(),
      })
      .where(eq(openingLocations.id, locationId));
  }

  const alertCreated = created
    ? await maybeAlert({
        locationId,
        alertType: 'newly_discovered',
        fingerprint: `new:${locationId}`,
        payload: { businessName: entry.businessName, status: entry.status },
      })
    : eventDecision.shouldCreate && eventDecision.eventDate
      ? await maybeAlert({
          locationId,
          alertType: 'grand_opening_announced',
          fingerprint: `grand:${locationId}:${eventDecision.eventDate}`,
          payload: { eventDate: eventDecision.eventDate },
        })
      : false;

  return {
    locationId,
    businessId: biz.id,
    created,
    updated,
    duplicateMerged,
    businessName: entry.businessName,
    status: entry.status,
    opportunityDecision: oppDecision.shouldCreate
      ? `create:${oppDecision.opportunityType}:${oppDecision.reason}`
      : `skip:${oppDecision.reason}`,
    eventDecision: eventDecision.shouldCreate
      ? `create:${eventDecision.eventDate}:${eventDecision.reason}`
      : `skip:${eventDecision.reason}`,
    opportunityContentItemId,
    calendarItemId,
    alertCreated,
  };
}

export { VERONICA_BEARD_OPPORTUNITY_ID };
