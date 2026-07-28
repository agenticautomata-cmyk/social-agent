/**
 * Controlled live backfill from an approved pinned-corpus proposal report.
 * Does not re-run extraction/OCR; persists approved destinations only.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  calendarDismissalFeedback,
  calendarSyncRecords,
  campaigns,
  contentItems,
  creatorCalendarItems,
  newsletterBackfillRuns,
  sources,
} from '../schema.js';
import { emitDataChange } from '../data-revision/index.js';
import { normalizeBusinessKey } from '../creator-interest/normalize.js';
import { parseEventDate } from '../ask-benson/listing-extract.js';
import {
  attachInventoryEvidence,
  upsertNewsletterSource,
  recordNewsletterSourceStats,
} from './sources.js';
import { upsertVerificationQueueRecord } from './verification-store.js';
import type { ExtractedNewsletterItem } from './types.js';

export const APPROVED_CORPUS_HASH = 'f04b8ae2b5a9c7ed956fa89b8293f4c0';
export const APPROVED_EXPECTED = {
  acceptedRecords: 640,
  opportunities: 372,
  inventoryOnly: 263,
  calendarSuggestions: 3,
  verificationQueue: 2,
} as const;

export type ApprovedSample = {
  entityName: string;
  title: string;
  layer: 'entity' | 'occurrence';
  entityType: string;
  occurrenceType: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  locationOutcome: string;
  verificationStatus: string;
  destination: string;
  fingerprint: string | null;
  gmailMessageId?: string;
  senderDomain?: string;
  newsletterSource?: string;
  officialSource?: string | null;
  subject?: string;
  confidence?: number;
  opportunityKinds?: string[];
  opportunityScore?: number;
  whyPassed?: string;
};

export type LivePersistCounters = {
  created: number;
  updated: number;
  merged: number;
  skipped: number;
  rejected: number;
  opportunitiesCreated: number;
  inventoryCreated: number;
  calendarCreated: number;
  calendarSkippedDismissed: number;
  calendarSkippedExisting: number;
  verificationCreated: number;
  verificationUpdated: number;
  evidenceAttached: number;
  sourcesUpserted: number;
};

export type LivePersistResult = {
  runId: string;
  dryRun: boolean;
  live: boolean;
  corpusCount: number;
  corpusHash: string;
  proposalTotals: Record<string, number>;
  counters: LivePersistCounters;
  postWriteCounts: Record<string, number>;
  materialMismatch: boolean;
  mismatchNotes: string[];
};

type ApprovedReportFile = {
  report: {
    messageIds?: string[];
    corpusHash?: string;
    corpusCount?: number;
    acceptedSamples: ApprovedSample[];
    rejectedSamples?: Array<Record<string, unknown>>;
    totals?: Record<string, number>;
  };
};

const NEWSLETTER_SOURCE_NAME = 'Newsletter Intelligence';

function emptyCounters(): LivePersistCounters {
  return {
    created: 0,
    updated: 0,
    merged: 0,
    skipped: 0,
    rejected: 0,
    opportunitiesCreated: 0,
    inventoryCreated: 0,
    calendarCreated: 0,
    calendarSkippedDismissed: 0,
    calendarSkippedExisting: 0,
    verificationCreated: 0,
    verificationUpdated: 0,
    evidenceAttached: 0,
    sourcesUpserted: 0,
  };
}

function corpusHashFromIds(ids: string[]): string {
  return createHash('sha256').update([...ids].sort().join('\n')).digest('hex').slice(0, 32);
}

function parseChicagoDateTime(date: string | null, time: string | null): Date | null {
  if (!date?.trim()) return null;
  const iso = time?.trim() ? `${date.trim()}T${time.trim()}` : date.trim();
  return parseEventDate(iso);
}

function sampleToItem(sample: ApprovedSample): ExtractedNewsletterItem {
  return {
    entityName: sample.entityName,
    entityType: (sample.entityType as ExtractedNewsletterItem['entityType']) || 'local_business',
    occurrenceType: (sample.occurrenceType as ExtractedNewsletterItem['occurrenceType']) ?? null,
    title: sample.title,
    description: sample.whyPassed ?? null,
    startDate: sample.date,
    endDate: null,
    startTime: sample.time,
    endTime: null,
    timezone: 'America/Chicago',
    venue: sample.location,
    streetAddress: null,
    city: null,
    state: null,
    zipCode: null,
    neighborhood: null,
    price: null,
    isFree: null,
    ageRestriction: null,
    rsvpRequired: null,
    reservationLink: null,
    ticketLink: null,
    officialWebsite: sample.officialSource ?? null,
    officialSocialLink: null,
    phone: null,
    organizer: null,
    sourceUrl: sample.officialSource ?? null,
    confidence: sample.confidence ?? 0.7,
    layer: sample.layer,
  };
}

async function defaultCampaignId(): Promise<string> {
  const row = await db.query.campaigns.findFirst({ where: eq(campaigns.active, true) });
  if (!row) throw new Error('no active campaign');
  return row.id;
}

async function getOrCreateNewsletterSourceId(campaignId: string): Promise<string> {
  const existing = await db.query.sources.findFirst({
    where: and(eq(sources.campaignId, campaignId), eq(sources.name, NEWSLETTER_SOURCE_NAME)),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(sources)
    .values({
      campaignId,
      type: 'manual',
      name: NEWSLETTER_SOURCE_NAME,
      config: { ingest: 'newsletter_intelligence' },
      active: true,
    })
    .returning({ id: sources.id });
  return created!.id;
}

async function findByFingerprint(fingerprint: string): Promise<{ id: string; metadata: unknown } | null> {
  const rows = await db
    .select({
      id: contentItems.id,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(sql`${contentItems.metadata}->>'occurrenceFingerprint' = ${fingerprint}`)
    .limit(1);
  return rows[0] ?? null;
}

async function findEntityByKey(businessKey: string): Promise<{ id: string; metadata: unknown } | null> {
  const rows = await db
    .select({ id: contentItems.id, metadata: contentItems.metadata })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.metadata}->>'opportunityLayer' = 'entity'`,
        sql`${contentItems.metadata}->>'businessKey' = ${businessKey}`,
        sql`${contentItems.metadata}->>'ingest' = 'newsletter_intelligence'`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function isManuallyProtected(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  if (m.manualEdit === true || m.userEdited === true) return true;
  if (m.inventoryStatus === 'confirmed' || m.inventoryStatus === 'dismissed') return true;
  return false;
}

async function isFingerprintDismissed(fingerprint: string): Promise<boolean> {
  const row = await db.query.calendarDismissalFeedback.findFirst({
    where: eq(calendarDismissalFeedback.occurrenceFingerprint, fingerprint),
  });
  if (row) return true;
  const cal = await db.query.creatorCalendarItems.findFirst({
    where: and(
      eq(creatorCalendarItems.occurrenceFingerprint, fingerprint),
      sql`(${creatorCalendarItems.planningStatus} = 'dismissed' OR ${creatorCalendarItems.dismissedAt} IS NOT NULL)`,
    ),
  });
  return Boolean(cal);
}

async function upsertCalendarSuggestion(input: {
  sample: ApprovedSample;
  contentItemId: string;
  fingerprint: string;
  dryRun: boolean;
  counters: LivePersistCounters;
}): Promise<void> {
  const { sample, contentItemId, fingerprint, dryRun, counters } = input;
  if (!sample.date) {
    counters.skipped += 1;
    return;
  }
  if (await isFingerprintDismissed(fingerprint)) {
    counters.calendarSkippedDismissed += 1;
    counters.skipped += 1;
    return;
  }

  const startAt = parseChicagoDateTime(sample.date, sample.time);
  if (!startAt || startAt.getTime() < Date.now() - 86400000) {
    counters.skipped += 1;
    return;
  }

  const idempotencyKey = `newsletter:${fingerprint}`;
  const existing = await db.query.creatorCalendarItems.findFirst({
    where: eq(creatorCalendarItems.idempotencyKey, idempotencyKey),
  });
  if (existing) {
    if (existing.planningStatus === 'confirmed' || existing.userEditedAt) {
      counters.calendarSkippedExisting += 1;
      counters.skipped += 1;
      return;
    }
    if (!dryRun) {
      await db
        .update(creatorCalendarItems)
        .set({
          updatedAt: new Date(),
          location: sample.location ?? existing.location,
          verificationState: sample.verificationStatus,
        })
        .where(eq(creatorCalendarItems.id, existing.id));
      counters.updated += 1;
    } else {
      counters.skipped += 1;
    }
    return;
  }

  if (dryRun) {
    counters.calendarCreated += 1;
    counters.created += 1;
    return;
  }

  const now = new Date();
  const [item] = await db
    .insert(creatorCalendarItems)
    .values({
      title: sample.title,
      description: sample.whyPassed ?? null,
      itemType: 'public_event',
      sourceRecordType: 'newsletter_occurrence',
      sourceRecordId: contentItemId,
      sourceUrl: sample.officialSource ?? null,
      internalDetailUrl: `/review/inventory?id=${contentItemId}`,
      startAt,
      endAt: null,
      allDay: !sample.time,
      timezone: 'America/Chicago',
      location: sample.location,
      status: 'suggested',
      planningStatus: 'suggested',
      creatorAction: 'attend',
      verifiedFields: sample.verificationStatus.startsWith('official_')
        ? ['source', 'date', 'location']
        : ['date', 'location'],
      unverifiedFields: sample.verificationStatus === 'trusted_secondary_source' ? ['official_confirmation'] : [],
      notes: `Newsletter suggestion · ${sample.newsletterSource ?? sample.senderDomain ?? 'unknown'}`,
      createdBy: 'benson_newsletter',
      idempotencyKey,
      occurrenceFingerprint: fingerprint,
      populationSource: 'newsletter_intelligence',
      verificationState: sample.verificationStatus,
      confidence: String(sample.confidence ?? 0.7),
      metadata: {
        newsletterDestination: 'calendar_suggestion',
        gmailMessageId: sample.gmailMessageId ?? null,
        senderDomain: sample.senderDomain ?? null,
        locationOutcome: sample.locationOutcome,
        opportunityKinds: sample.opportunityKinds ?? [],
      },
      updatedAt: now,
    })
    .returning();

  await db.insert(calendarSyncRecords).values({
    calendarItemId: item!.id,
    googleCalendarId: 'pending',
    syncStatus: 'benson_only',
    autoUpdateEnabled: false,
    updatedAt: now,
  });

  counters.calendarCreated += 1;
  counters.created += 1;
}

async function countNewsletterDestinations(): Promise<Record<string, number>> {
  const newsletterItems = await db.execute(sql`
    SELECT count(*)::int AS c FROM content_items
    WHERE metadata->>'ingest' = 'newsletter_intelligence'
  `);
  const opportunities = await db.execute(sql`
    SELECT count(*)::int AS c FROM content_items
    WHERE metadata->>'ingest' = 'newsletter_intelligence'
      AND metadata->>'newsletterDestination' = 'opportunity'
      AND COALESCE(lifecycle_status, 'active') = 'active'
  `);
  const inventoryOnly = await db.execute(sql`
    SELECT count(*)::int AS c FROM content_items
    WHERE metadata->>'ingest' = 'newsletter_intelligence'
      AND metadata->>'newsletterDestination' = 'inventory_only'
  `);
  const calendarContent = await db.execute(sql`
    SELECT count(*)::int AS c FROM content_items
    WHERE metadata->>'ingest' = 'newsletter_intelligence'
      AND metadata->>'newsletterDestination' = 'calendar_suggestion'
  `);
  const calendarSuggested = await db.execute(sql`
    SELECT count(*)::int AS c FROM creator_calendar_items
    WHERE population_source = 'newsletter_intelligence'
      AND planning_status = 'suggested'
  `);
  const verificationQueue = await db.execute(sql`
    SELECT count(*)::int AS c FROM newsletter_verification_queue
  `);
  const evidence = await db.execute(sql`
    SELECT count(*)::int AS c FROM inventory_evidence
  `);
  const newsletterSourcesCount = await db.execute(sql`
    SELECT count(*)::int AS c FROM newsletter_sources
  `);

  const num = (res: { rows?: Array<Record<string, unknown>> } | unknown) => {
    const rows = (res as { rows?: Array<Record<string, unknown>> }).rows
      ?? (Array.isArray(res) ? (res as Array<Record<string, unknown>>) : []);
    return Number(rows[0]?.c ?? 0);
  };

  return {
    newsletterItems: num(newsletterItems),
    opportunities: num(opportunities),
    inventoryOnly: num(inventoryOnly),
    calendarContent: num(calendarContent),
    calendarSuggested: num(calendarSuggested),
    verificationQueue: num(verificationQueue),
    evidence: num(evidence),
    newsletterSources: num(newsletterSourcesCount),
  };
}

export async function persistApprovedNewsletterBackfill(options: {
  approvedReportPath: string;
  live: boolean;
  confirmLiveBackfill?: string;
  expectedCorpusHash?: string;
}): Promise<LivePersistResult> {
  const live = options.live === true;
  if (live && options.confirmLiveBackfill !== 'NEWSLETTER_LIVE_BACKFILL') {
    throw new Error('Live backfill requires confirmLiveBackfill:"NEWSLETTER_LIVE_BACKFILL"');
  }

  const file = JSON.parse(readFileSync(options.approvedReportPath, 'utf8')) as ApprovedReportFile;
  const report = file.report;
  const messageIds = report.messageIds ?? [];
  const corpusHash = report.corpusHash ?? corpusHashFromIds(messageIds);
  const expectedHash = options.expectedCorpusHash ?? APPROVED_CORPUS_HASH;
  const mismatchNotes: string[] = [];

  if (messageIds.length !== 197) {
    mismatchNotes.push(`messageIds=${messageIds.length} expected 197`);
  }
  if (corpusHash !== expectedHash) {
    mismatchNotes.push(`corpusHash=${corpusHash} expected ${expectedHash}`);
  }

  const samples = report.acceptedSamples ?? [];
  const byDest = {
    opportunity: samples.filter((s) => s.destination === 'opportunity').length,
    inventory_only: samples.filter((s) => s.destination === 'inventory_only').length,
    calendar_suggestion: samples.filter((s) => s.destination === 'calendar_suggestion').length,
    verification_queue: samples.filter((s) => s.destination === 'verification_queue').length,
  };
  if (samples.length !== APPROVED_EXPECTED.acceptedRecords) {
    mismatchNotes.push(`accepted=${samples.length} expected ${APPROVED_EXPECTED.acceptedRecords}`);
  }
  if (byDest.opportunity !== APPROVED_EXPECTED.opportunities) {
    mismatchNotes.push(`opportunities=${byDest.opportunity} expected ${APPROVED_EXPECTED.opportunities}`);
  }
  if (byDest.inventory_only !== APPROVED_EXPECTED.inventoryOnly) {
    mismatchNotes.push(`inventory=${byDest.inventory_only} expected ${APPROVED_EXPECTED.inventoryOnly}`);
  }
  if (byDest.calendar_suggestion !== APPROVED_EXPECTED.calendarSuggestions) {
    mismatchNotes.push(`calendar=${byDest.calendar_suggestion} expected ${APPROVED_EXPECTED.calendarSuggestions}`);
  }
  if (byDest.verification_queue !== APPROVED_EXPECTED.verificationQueue) {
    mismatchNotes.push(`vq=${byDest.verification_queue} expected ${APPROVED_EXPECTED.verificationQueue}`);
  }

  const materialMismatch = mismatchNotes.length > 0;
  if (materialMismatch && live) {
    throw new Error(`Approved proposal totals mismatch; refusing live write: ${mismatchNotes.join('; ')}`);
  }

  const dryRun = !live;
  const [runRow] = await db
    .insert(newsletterBackfillRuns)
    .values({
      dryRun,
      sinceDays: 180,
      status: 'running',
      report: {
        mode: 'approved_pinned_persist',
        approvedReportPath: options.approvedReportPath,
        corpusHash,
        proposalTotals: byDest,
      },
    })
    .returning();

  const counters = emptyCounters();
  counters.rejected = report.rejectedSamples?.length ?? 0;

  try {
    const campaignId = await defaultCampaignId();
    const sourceId = await getOrCreateNewsletterSourceId(campaignId);
    const sourceCache = new Map<string, string>();

    let sampleIndex = 0;
    for (const sample of samples) {
      try {
      sampleIndex += 1;
      const fingerprint =
        sample.fingerprint ||
        createHash('sha256')
          .update(
            [
              'approved',
              String(sampleIndex),
              sample.layer,
              sample.entityName,
              sample.title,
              sample.date ?? '',
              sample.location ?? '',
              sample.gmailMessageId ?? '',
              sample.destination,
            ].join('|'),
          )
          .digest('hex')
          .slice(0, 32);
      const businessKey = normalizeBusinessKey(sample.entityName);
      // Approved persist keeps one row per proposal sample so destination totals match.
      // businessKey remains in metadata for canonical linking without collapsing proposals.
      const existing = await findByFingerprint(fingerprint);

      if (existing && isManuallyProtected(existing.metadata)) {
        counters.skipped += 1;
        continue;
      }

      const eventStartsAt = parseChicagoDateTime(sample.date, sample.time);
      const destination = sample.destination;
      const creatorValueStatus =
        destination === 'opportunity' || destination === 'calendar_suggestion'
          ? 'creator_candidate'
          : 'hidden_raw_signal';
      const inventoryStatus =
        destination === 'opportunity' || destination === 'calendar_suggestion'
          ? 'suggested'
          : 'unreviewed';

      let contentItemId: string;

      if (existing) {
        if (!dryRun) {
          await db
            .update(contentItems)
            .set({
              lastSeenAt: new Date(),
              sourceLastCheckedAt: new Date(),
              stale: false,
              locationName: sample.location ?? undefined,
              eventStartsAt: eventStartsAt ?? undefined,
              creatorValueStatus,
              metadata: sql`${contentItems.metadata} || ${JSON.stringify({
                newsletterDestination: destination,
                opportunityKinds: sample.opportunityKinds ?? [],
                opportunityScore: sample.opportunityScore ?? 0,
                locationOutcome: sample.locationOutcome,
                verificationStatus: sample.verificationStatus,
                lastNewsletterSeenAt: new Date().toISOString(),
                inventoryStatus,
              })}::jsonb`,
              updatedAt: new Date(),
            })
            .where(eq(contentItems.id, existing.id));
        }
        contentItemId = existing.id;
        counters.updated += 1;
        counters.merged += 1;
      } else if (dryRun) {
        contentItemId = 'dry-run';
        counters.created += 1;
        if (destination === 'opportunity') counters.opportunitiesCreated += 1;
        if (destination === 'inventory_only') counters.inventoryCreated += 1;
      } else {
        const metadata = {
          ingest: 'newsletter_intelligence',
          opportunityLayer: sample.layer,
          opportunityType: sample.occurrenceType ?? sample.entityType,
          entityType: sample.entityType,
          occurrenceType: sample.occurrenceType,
          businessKey,
          inventoryStatus,
          verificationStatus: sample.verificationStatus,
          occurrenceFingerprint: fingerprint,
          newsletterDestination: destination,
          opportunityKinds: sample.opportunityKinds ?? [],
          opportunityScore: sample.opportunityScore ?? 0,
          locationOutcome: sample.locationOutcome,
          newsletterAttribution: {
            foundIn: sample.newsletterSource ?? sample.senderDomain ?? null,
            senderDomain: sample.senderDomain ?? null,
            gmailMessageId: sample.gmailMessageId ?? null,
            subject: sample.subject ?? null,
          },
          newsletterFields: {
            startTimeText: sample.time,
            sourceDateText: sample.date,
            timezone: 'America/Chicago',
            officialWebsite: sample.officialSource ?? null,
          },
          lastVerifiedAt: new Date().toISOString(),
        };

        const [inserted] = await db
          .insert(contentItems)
          .values({
            campaignId,
            type: 'industry_insight',
            language: 'en',
            state: 'planned',
            topic: sample.title.slice(0, 500),
            hook: sample.entityName.slice(0, 500),
            script: sample.whyPassed?.slice(0, 4000) ?? null,
            sourceId,
            sourceExternalId: `newsletter:${fingerprint}`,
            sourceUrl: sample.officialSource ?? null,
            discoveredAt: new Date(),
            eventStartsAt,
            eventEndsAt: null,
            locationName: sample.location,
            metadata,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            sourceLastCheckedAt: new Date(),
            stale: false,
            freshnessBucket: 'fresh',
            creatorValueStatus,
            lifecycleStatus: 'active',
          })
          .returning({ id: contentItems.id });
        contentItemId = inserted!.id;
        counters.created += 1;
        if (destination === 'opportunity') counters.opportunitiesCreated += 1;
        if (destination === 'inventory_only') counters.inventoryCreated += 1;
      }

      // Newsletter source + evidence
      const domain = sample.senderDomain ?? 'unknown';
      if (!dryRun) {
        let newsletterSourceId = sourceCache.get(domain);
        if (!newsletterSourceId) {
          const src = await upsertNewsletterSource({
            senderEmail: null,
            senderDomain: domain,
            senderName: sample.newsletterSource ?? null,
            category: 'local_newsletter',
          });
          newsletterSourceId = src.id;
          sourceCache.set(domain, src.id);
          counters.sourcesUpserted += 1;
          await recordNewsletterSourceStats(src.id, {
            emailsProcessed: 1,
            entitiesExtracted: sample.layer === 'entity' ? 1 : 0,
            occurrencesExtracted: sample.layer === 'occurrence' ? 1 : 0,
            parsed: true,
          });
        }

        if (contentItemId !== 'dry-run' && sample.gmailMessageId) {
          const before = counters.evidenceAttached;
          await attachInventoryEvidence({
            contentItemId,
            evidenceType: 'newsletter_email',
            sourceLabel: sample.newsletterSource ?? domain,
            gmailMessageId: sample.gmailMessageId,
            newsletterSourceId,
            sourceUrl: sample.officialSource ?? null,
            canonicalSourceUrl: sample.officialSource ?? null,
            receivedAt: new Date(),
            verificationStatus: sample.verificationStatus,
            metadata: {
              subject: sample.subject ?? null,
              destination,
              fingerprint,
            },
          });
          // attachInventoryEvidence is idempotent; recount via attempt
          counters.evidenceAttached = before + 1;
        }

        if (destination === 'verification_queue' && contentItemId !== 'dry-run') {
          const existingVq = await db.execute(sql`
            SELECT id FROM newsletter_verification_queue
            WHERE occurrence_fingerprint = ${fingerprint}
            LIMIT 1
          `);
          const existingRows = Array.isArray(existingVq)
            ? (existingVq as Array<{ id: string }>)
            : (((existingVq as { rows?: Array<{ id: string }> }).rows) ?? []);
          const had = existingRows.length > 0;
          await upsertVerificationQueueRecord({
            contentItemId,
            item: sampleToItem(sample),
            verification: {
              status: (sample.verificationStatus as 'newsletter_only') || 'newsletter_only',
              priority: 6,
              newsletterClaim: {
                startDate: sample.date,
                endDate: null,
                startTime: sample.time,
                endTime: null,
                venue: sample.location,
                address: sample.location,
                price: null,
                sourceUrl: sample.officialSource ?? null,
              },
              officialClaim: null,
              conflictingFields: sample.locationOutcome === 'location_unknown' ? ['location'] : [],
              canonicalOfficialUrl: sample.officialSource ?? null,
            },
            occurrenceFingerprint: fingerprint,
            gmailMessageId: sample.gmailMessageId ?? '',
            newsletterSourceId,
          });
          if (had) counters.verificationUpdated += 1;
          else counters.verificationCreated += 1;
        }
      } else if (destination === 'verification_queue') {
        counters.verificationCreated += 1;
      }

      if (destination === 'calendar_suggestion') {
        await upsertCalendarSuggestion({
          sample,
          contentItemId,
          fingerprint,
          dryRun,
          counters,
        });
      }
      } catch (sampleErr) {
        const msg = sampleErr instanceof Error ? sampleErr.message : String(sampleErr);
        throw new Error(
          `Failed on sample ${sample.entityName} / ${sample.title} / ${sample.destination}: ${msg}`,
        );
      }
    }

    if (!dryRun) {
      await emitDataChange({
        eventType: 'opportunity_enrichment',
        domains: ['opportunities', 'calendar', 'recommendations', 'home_briefing'],
        completedAt: new Date().toISOString(),
        source: 'newsletter-intelligence.live-backfill',
        success: true,
      });
    }

    const postWriteCounts = await countNewsletterDestinations();
    const result: LivePersistResult = {
      runId: runRow!.id,
      dryRun,
      live,
      corpusCount: report.corpusCount ?? messageIds.length,
      corpusHash,
      proposalTotals: {
        accepted: samples.length,
        ...byDest,
        rejected: counters.rejected,
      },
      counters,
      postWriteCounts,
      materialMismatch: false,
      mismatchNotes: [],
    };

    // Post-write material check (live only)
    if (live) {
      const notes: string[] = [];
      if (postWriteCounts.opportunities !== APPROVED_EXPECTED.opportunities) {
        notes.push(
          `post opportunities=${postWriteCounts.opportunities} expected ${APPROVED_EXPECTED.opportunities}`,
        );
      }
      if (postWriteCounts.inventoryOnly !== APPROVED_EXPECTED.inventoryOnly) {
        notes.push(
          `post inventory=${postWriteCounts.inventoryOnly} expected ${APPROVED_EXPECTED.inventoryOnly}`,
        );
      }
      if (postWriteCounts.calendarSuggested !== APPROVED_EXPECTED.calendarSuggestions) {
        notes.push(
          `post calendar_suggested=${postWriteCounts.calendarSuggested} expected ${APPROVED_EXPECTED.calendarSuggestions}`,
        );
      }
      if (postWriteCounts.verificationQueue !== APPROVED_EXPECTED.verificationQueue) {
        notes.push(
          `post vq=${postWriteCounts.verificationQueue} expected ${APPROVED_EXPECTED.verificationQueue}`,
        );
      }
      result.mismatchNotes = notes;
      result.materialMismatch = notes.length > 0;
    }

    await db
      .update(newsletterBackfillRuns)
      .set({
        status: result.materialMismatch ? 'completed_with_mismatch' : 'completed',
        completedAt: new Date(),
        report: result as never,
      })
      .where(eq(newsletterBackfillRuns.id, runRow!.id));

    return result;
  } catch (err) {
    await db
      .update(newsletterBackfillRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        report: {
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .where(eq(newsletterBackfillRuns.id, runRow!.id));
    throw err;
  }
}
