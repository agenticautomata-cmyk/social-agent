import { and, eq, gte, inArray, isNotNull, isNull, lte, not, or } from 'drizzle-orm';
import { db } from '../../db.js';
import {
  calendarDismissalFeedback,
  calendarSyncRecords,
  contentItems,
  creatorCalendarItems,
  curatorEventLeads,
  sources,
  type CreatorCalendarItem,
} from '../../schema.js';
import { loadSkippedContentIdsForItems } from '../../creator-skip/index.js';
import type { SkipMatchIdentity } from '../../creator-skip/fingerprint.js';
import { inventoryLoadContentItemSelect } from '../../inventory/inventory-load-projection.js';
import { normalizeInventoryItem } from '../../inventory/normalize.js';
import {
  calendarInventoryExtractedTemporalSelect,
  temporalEvidenceFromCalendarRow,
} from './inventory-temporal-evidence.js';
import { emitDataChange } from '../../data-revision/index.js';
import { sanitizeScrapedText, sanitizeScrapedTitle } from '../../text-sanitize/sanitize-scraped-text.js';
import type { PopulationCandidate, CalendarBackfillReport, PopulationRejection } from './types.js';
import { calendarSkipIdentity, calendarIdentitiesMatch, dedupePopulationCandidates, skipIdentityForCandidate } from './merge.js';
import {
  candidateFromCuratorLead,
  candidateFromInventory,
  evaluateCuratorLeadCalendarEligibility,
  evaluateInventoryCalendarEligibility,
  strongerVerification,
  verificationRank,
  type CuratorLeadEligibilityInput,
} from './eligibility.js';
import {
  CALENDAR_ADMISSION_RULE_VERSION,
  readAdmissionFromMetadata,
} from '../admission/index.js';
import { calendarReadSpan, nowMs } from './read-profile.js';
import {
  bumpCalendarProjectionExecutionCount,
  calendarProjectionReadPlan,
  calendarProjectionWindowKey,
  getCalendarProjectionInflight,
  noteCalendarProjectionReconciled,
  setCalendarProjectionInflight,
  type CalendarProjectionMode,
} from './projection-freshness.js';
import {
  materialMetadataForCompare,
  snapshotsEqual,
  suggestionSemanticHash,
  type SuggestionSemanticSnapshot,
} from './semantic-equality.js';

const PROTECTED_STATUSES = new Set(['confirmed', 'dismissed', 'cancelled', 'completed', 'missed']);

/** True when Benson population must not overwrite operator/user-owned calendar state. */
export function isProtectedCalendarSuggestion(
  row: Pick<CreatorCalendarItem, 'userEditedAt' | 'planningStatus' | 'createdBy' | 'populationSource'>,
): boolean {
  if (row.userEditedAt) return true;
  if (PROTECTED_STATUSES.has(row.planningStatus)) return true;
  if (row.createdBy === 'kellie' && row.populationSource == null) return true;
  return false;
}

/**
 * Planned allDay write for suggestion upsert.
 * Existing protected rows keep their allDay; mutable rows take candidate.allDay.
 */
export function planSuggestionUpsertAllDay(
  existing:
    | Pick<
        CreatorCalendarItem,
        'allDay' | 'userEditedAt' | 'planningStatus' | 'createdBy' | 'populationSource'
      >
    | null,
  candidate: Pick<PopulationCandidate, 'allDay'>,
):
  | { outcome: 'created'; allDay: boolean }
  | { outcome: 'updated'; allDay: boolean; previousAllDay: boolean }
  | { outcome: 'preserved'; allDay: boolean } {
  const allDay = candidate.allDay ?? false;
  if (!existing) return { outcome: 'created', allDay };
  if (isProtectedCalendarSuggestion(existing)) {
    return { outcome: 'preserved', allDay: existing.allDay };
  }
  return { outcome: 'updated', allDay, previousAllDay: existing.allDay };
}

function skipIdentityForRow(row: Pick<CreatorCalendarItem, 'title' | 'startAt' | 'location'>): SkipMatchIdentity | null {
  return calendarSkipIdentity({
    title: row.title,
    startAt: row.startAt.toISOString(),
    location: row.location,
  });
}

async function loadDismissedFingerprints(fingerprints: string[]): Promise<Set<string>> {
  const unique = [...new Set(fingerprints.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const feedback = await db
    .select({ fp: calendarDismissalFeedback.occurrenceFingerprint })
    .from(calendarDismissalFeedback)
    .where(inArray(calendarDismissalFeedback.occurrenceFingerprint, unique));
  const dismissedRows = await db
    .select({
      fp: creatorCalendarItems.occurrenceFingerprint,
      skipMeta: creatorCalendarItems.metadata,
    })
    .from(creatorCalendarItems)
    .where(
      and(
        or(
          eq(creatorCalendarItems.planningStatus, 'dismissed'),
          isNotNull(creatorCalendarItems.dismissedAt),
        ),
        inArray(creatorCalendarItems.occurrenceFingerprint, unique),
      ),
    );
  const out = new Set<string>();
  for (const row of feedback) out.add(row.fp);
  for (const row of dismissedRows) {
    if (row.fp) out.add(row.fp);
  }
  return out;
}

async function loadWindowCalendarItems(from: Date, to: Date): Promise<CreatorCalendarItem[]> {
  const profile = calendarReadSpan();
  const started = nowMs();
  const rows = await db
    .select()
    .from(creatorCalendarItems)
    .where(and(gte(creatorCalendarItems.startAt, from), lte(creatorCalendarItems.startAt, to)));
  profile.existingWindowLoadMs += nowMs() - started;
  return rows;
}

function findExistingForCandidate(
  candidate: PopulationCandidate,
  existing: CreatorCalendarItem[],
): CreatorCalendarItem | null {
  const byKey = existing.find((row) => row.idempotencyKey && row.idempotencyKey === candidate.idempotencyKey);
  if (byKey) return byKey;
  const byFp = existing.find(
    (row) => row.occurrenceFingerprint && row.occurrenceFingerprint === candidate.occurrenceFingerprint,
  );
  if (byFp) return byFp;
  const incoming = skipIdentityForCandidate(candidate);
  if (!incoming) return null;
  return (
    existing.find((row) => {
      const identity = skipIdentityForRow(row);
      return identity ? calendarIdentitiesMatch(identity, incoming) : false;
    }) ?? null
  );
}

function isProtected(row: CreatorCalendarItem): boolean {
  return isProtectedCalendarSuggestion(row);
}

async function collectInventoryCandidates(from: Date, to: Date, now: Date): Promise<PopulationCandidate[]> {
  const profile = calendarReadSpan();
  const loadStarted = nowMs();
  const rows = await db
    .select({
      ...inventoryLoadContentItemSelect,
      ...calendarInventoryExtractedTemporalSelect,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(
      and(
        isNotNull(contentItems.eventStartsAt),
        gte(contentItems.eventStartsAt, from),
        lte(contentItems.eventStartsAt, to),
        not(inArray(contentItems.lifecycleStatus, ['expired', 'archived'])),
        not(inArray(contentItems.creatorValueStatus, ['rejected', 'archived'])),
      ),
    );
  profile.inventoryLoadMs += nowMs() - loadStarted;

  const normalizeStarted = nowMs();
  const items = rows.map(
    ({
      sourceName,
      sourceType,
      calendarExtractedEventDate,
      calendarExtractedEventEndDate,
      calendarExtractedStartTime,
      calendarExtractedTitle,
      ...item
    }) =>
      normalizeInventoryItem(item, sourceName, sourceType, {
        temporalEvidence: temporalEvidenceFromCalendarRow({
          calendarExtractedEventDate,
          calendarExtractedEventEndDate,
          calendarExtractedStartTime,
          calendarExtractedTitle,
        }),
      }),
  );
  profile.inventoryNormalizeMs += nowMs() - normalizeStarted;

  const skipStarted = nowMs();
  const skipped = await loadSkippedContentIdsForItems(items).catch(() => new Set<string>());
  profile.inventorySkipMs += nowMs() - skipStarted;

  const eligStarted = nowMs();
  const out: PopulationCandidate[] = [];
  for (const item of items) {
    if (skipped.has(item.id)) continue;
    const decision = evaluateInventoryCalendarEligibility(item, now);
    if (!decision.ok) continue;
    out.push(candidateFromInventory(item));
  }
  profile.inventoryEligibilityMs += nowMs() - eligStarted;
  profile.inventoryCandidateCount = out.length;
  return out;
}

async function collectCuratorCandidates(from: Date, to: Date, now: Date): Promise<PopulationCandidate[]> {
  const profile = calendarReadSpan();
  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);
  const loadStarted = nowMs();
  const rows = await db
    .select()
    .from(curatorEventLeads)
    .where(
      and(
        isNull(curatorEventLeads.dismissedAt),
        isNotNull(curatorEventLeads.eventDate),
        gte(curatorEventLeads.eventDate, fromDay),
        lte(curatorEventLeads.eventDate, toDay),
        not(inArray(curatorEventLeads.verificationStatus, ['EXPIRED', 'CONFLICTED'])),
      ),
    );
  profile.curatorLoadMs += nowMs() - loadStarted;

  const eligStarted = nowMs();
  const out: PopulationCandidate[] = [];
  for (const row of rows) {
    const lead: CuratorLeadEligibilityInput = {
      id: row.id,
      eventName: row.eventName,
      eventDate: row.eventDate,
      eventTime: row.eventTime,
      venue: row.venue,
      neighborhood: row.neighborhood,
      dayHeading: row.dayHeading,
      originalQuotedText: row.originalQuotedText,
      verificationStatus: row.verificationStatus,
      dismissedAt: row.dismissedAt,
      discoveredViaHandle: row.discoveredViaHandle,
      discoveredViaPostUrl: row.discoveredViaPostUrl,
      officialOrganizerUrl: row.officialOrganizerUrl,
      officialVenueUrl: row.officialVenueUrl,
      ticketUrl: row.ticketUrl,
      officialSocialUrl: row.officialSocialUrl,
      linkedContentItemId: row.linkedContentItemId,
      watcherId: row.watcherId,
      creatorValueScore: row.creatorValueScore,
      occurrenceFingerprint: row.occurrenceFingerprint,
    };
    const decision = evaluateCuratorLeadCalendarEligibility(lead, now);
    if (!decision.ok) continue;
    const candidate = candidateFromCuratorLead(lead);
    if (candidate) out.push(candidate);
  }
  profile.curatorEligibilityMs += nowMs() - eligStarted;
  profile.curatorCandidateCount = out.length;
  return out;
}

async function upsertSuggestion(
  candidate: PopulationCandidate,
  existing: CreatorCalendarItem | null,
): Promise<'created' | 'updated' | 'unchanged' | 'preserved'> {
  const now = new Date();
  if (existing && isProtected(existing)) return 'preserved';

  const title = sanitizeScrapedTitle(candidate.title);
  const description = candidate.description ? sanitizeScrapedText(candidate.description) : null;
  const location = candidate.location ? sanitizeScrapedTitle(candidate.location) : candidate.location ?? null;
  const verification = existing
    ? strongerVerification(existing.verificationState, candidate.verificationState)
    : (candidate.verificationState ?? 'unverified');

  // Build proposed metadata without rewriting identical admission blocks.
  const existingMeta = (existing?.metadata as Record<string, unknown> | null) ?? {};
  const candidateMeta = candidate.metadata ?? {};
  const mergedWhy = [existingMeta.whyIncluded, candidate.whyIncluded]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .flatMap((v) => v.split(/\s*\+\s*/))
    .map((s) => s.trim())
    .filter(Boolean);
  const whyIncluded = [...new Set(mergedWhy)].sort().join(' + ') || candidate.whyIncluded;
  const mergedMeta: Record<string, unknown> = {
    ...existingMeta,
    ...candidateMeta,
    whyIncluded,
  };
  // Prefer keeping existing admission when lifecycle/reason/rule are unchanged.
  // Display-title / extracted-date / evidence.title drift must not force rewrites.
  const existingAdmission = existingMeta.calendarAdmission;
  const proposedAdmission = candidateMeta.calendarAdmission;
  if (existingAdmission && proposedAdmission) {
    const ea = existingAdmission as Record<string, unknown>;
    const pa = proposedAdmission as Record<string, unknown>;
    const sameCore =
      ea.lifecycle === pa.lifecycle &&
      ea.primaryReason === pa.primaryReason &&
      ea.ruleVersion === pa.ruleVersion &&
      JSON.stringify(ea.reasonCodes ?? []) === JSON.stringify(pa.reasonCodes ?? []);
    if (sameCore) {
      mergedMeta.calendarAdmission = existingAdmission;
    } else if (
      JSON.stringify(materialMetadataForCompare({ calendarAdmission: existingAdmission })) ===
      JSON.stringify(materialMetadataForCompare({ calendarAdmission: proposedAdmission }))
    ) {
      mergedMeta.calendarAdmission = existingAdmission;
    }
  }

  if (existing) {
    // Prefer existing display title on update — prevents merge-order flip-flops
    // when alternate inventory titles share identity but different fingerprints.
    const stableTitle = existing.title?.trim().length >= 3 ? existing.title : title;
    const proposedSourceUrl = (() => {
      let url = existing.sourceUrl ?? null;
      if (candidate.sourceUrl && !existing.sourceUrl) url = candidate.sourceUrl;
      if (candidate.sourceUrl && existing.sourceUrl !== candidate.sourceUrl) {
        if (/\/event\//i.test(candidate.sourceUrl) && !/\/event\//i.test(existing.sourceUrl ?? '')) {
          url = candidate.sourceUrl;
        }
      }
      if (verificationRank(candidate.verificationState) > verificationRank(existing.verificationState)) {
        if (candidate.sourceUrl) url = candidate.sourceUrl;
      }
      return url;
    })();

    const proposedLocation = (() => {
      if (location) {
        if (!existing.location || /^kansas\s+city$/i.test(existing.location.trim())) {
          return location;
        }
      }
      return existing.location ?? null;
    })();

    const proposedEndAt = candidate.endAt
      ? new Date(candidate.endAt)
      : existing.endAt;

    const toIsoSecond = (d: Date | string | null | undefined): string | null => {
      if (!d) return null;
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return new Date(Math.floor(dt.getTime() / 1000) * 1000).toISOString();
    };

    const proposed: SuggestionSemanticSnapshot = {
      title: stableTitle,
      description: description !== null ? description : existing.description ?? null,
      location: proposedLocation,
      startAt: toIsoSecond(candidate.startAt) ?? new Date(candidate.startAt).toISOString(),
      endAt: toIsoSecond(proposedEndAt),
      allDay: candidate.allDay ?? false,
      sourceUrl: proposedSourceUrl,
      internalDetailUrl:
        candidate.internalDetailUrl && !existing.internalDetailUrl
          ? candidate.internalDetailUrl
          : existing.internalDetailUrl ?? null,
      notes: (whyIncluded as string | undefined) ?? existing.notes ?? null,
      verificationState: verification ?? null,
      occurrenceFingerprint: existing.occurrenceFingerprint ?? candidate.occurrenceFingerprint,
      idempotencyKey: existing.idempotencyKey ?? candidate.idempotencyKey,
      populationSource: existing.populationSource ?? candidate.populationSource,
      calendarIntent: existing.calendarIntent ?? candidate.calendarIntent,
      sourceRecordType:
        candidate.sourceRecordType === 'content_item' && existing.sourceRecordType !== 'content_item'
          ? 'content_item'
          : existing.sourceRecordType,
      sourceRecordId:
        candidate.sourceRecordType === 'content_item' && existing.sourceRecordType !== 'content_item'
          ? candidate.sourceRecordId
          : existing.sourceRecordId,
      admission: materialMetadataForCompare(mergedMeta).calendarAdmission ?? null,
      whyIncluded: materialMetadataForCompare(mergedMeta).whyIncluded ?? null,
    };

    const current: SuggestionSemanticSnapshot = {
      title: existing.title,
      description: existing.description ?? null,
      location: existing.location ?? null,
      startAt: toIsoSecond(existing.startAt) ?? existing.startAt.toISOString(),
      endAt: toIsoSecond(existing.endAt),
      allDay: existing.allDay ?? false,
      sourceUrl: existing.sourceUrl ?? null,
      internalDetailUrl: existing.internalDetailUrl ?? null,
      notes:
        typeof existing.notes === 'string'
          ? [...new Set(existing.notes.split(/\s*\+\s*/).map((s) => s.trim()).filter(Boolean))]
              .sort()
              .join(' + ')
          : existing.notes ?? null,
      verificationState: existing.verificationState ?? null,
      occurrenceFingerprint: existing.occurrenceFingerprint,
      idempotencyKey: existing.idempotencyKey,
      populationSource: existing.populationSource,
      calendarIntent: existing.calendarIntent,
      sourceRecordType: existing.sourceRecordType,
      sourceRecordId: existing.sourceRecordId,
      admission: materialMetadataForCompare(existingMeta).calendarAdmission ?? null,
      whyIncluded: materialMetadataForCompare(existingMeta).whyIncluded ?? null,
    };

    if (snapshotsEqual(current, proposed)) {
      // True no-op: do not touch updatedAt or rewrite identical admission metadata.
      await linkCuratorLead(candidate, existing.id);
      return 'unchanged';
    }

    // Secondary guard: content hash stored on prior write (survives volatile stamp drift).
    const proposedHash = suggestionSemanticHash(proposed);
    const priorHash =
      typeof existingMeta.projectionContentHash === 'string'
        ? existingMeta.projectionContentHash
        : null;
    if (priorHash && priorHash === proposedHash) {
      await linkCuratorLead(candidate, existing.id);
      return 'unchanged';
    }

    const patch: Partial<typeof creatorCalendarItems.$inferInsert> = {
      updatedAt: now,
      verificationState: verification,
      metadata: {
        ...mergedMeta,
        projectionContentHash: proposedHash,
      },
      allDay: candidate.allDay ?? false,
      startAt: new Date(candidate.startAt),
      title: stableTitle,
    };
    if (candidate.endAt) {
      patch.endAt = new Date(candidate.endAt);
    }
    if (proposedSourceUrl && proposedSourceUrl !== existing.sourceUrl) {
      patch.sourceUrl = proposedSourceUrl;
    }
    if (candidate.internalDetailUrl && !existing.internalDetailUrl) {
      patch.internalDetailUrl = candidate.internalDetailUrl;
    }
    if (proposedLocation && proposedLocation !== existing.location) {
      patch.location = proposedLocation;
    }
    if (description !== null && description !== existing.description) {
      patch.description = description;
    }
    if (candidate.whyIncluded && candidate.whyIncluded !== existing.notes) {
      patch.notes = candidate.whyIncluded;
    }
    if (
      candidate.sourceRecordType === 'content_item' &&
      existing.sourceRecordType !== 'content_item'
    ) {
      patch.sourceRecordType = 'content_item';
      patch.sourceRecordId = candidate.sourceRecordId;
      patch.internalDetailUrl = candidate.internalDetailUrl ?? existing.internalDetailUrl;
    }
    if (!existing.occurrenceFingerprint) patch.occurrenceFingerprint = candidate.occurrenceFingerprint;
    if (!existing.idempotencyKey) patch.idempotencyKey = candidate.idempotencyKey;
    if (!existing.populationSource) patch.populationSource = candidate.populationSource;
    if (!existing.calendarIntent) patch.calendarIntent = candidate.calendarIntent;

    await db.update(creatorCalendarItems).set(patch).where(eq(creatorCalendarItems.id, existing.id));
    await linkCuratorLead(candidate, existing.id);
    return 'updated';
  }

  const meta = mergedMeta;
  const [item] = await db
    .insert(creatorCalendarItems)
    .values({
      title,
      description,
      itemType: candidate.itemType,
      sourceRecordType: candidate.sourceRecordType,
      sourceRecordId: candidate.sourceRecordId,
      sourceUrl: candidate.sourceUrl ?? null,
      internalDetailUrl: candidate.internalDetailUrl ?? null,
      startAt: new Date(candidate.startAt),
      endAt: candidate.endAt ? new Date(candidate.endAt) : null,
      allDay: candidate.allDay ?? false,
      timezone: candidate.timezone ?? 'America/Chicago',
      location,
      status: 'suggested',
      planningStatus: 'suggested',
      creatorAction: 'attend',
      verifiedFields: verificationRank(candidate.verificationState) >= 40 ? ['date', 'location', 'source'] : ['date'],
      unverifiedFields: verificationRank(candidate.verificationState) >= 40 ? [] : ['official_confirmation'],
      notes: candidate.whyIncluded ?? null,
      createdBy: candidate.createdBy ?? 'benson_inventory',
      idempotencyKey: candidate.idempotencyKey,
      calendarIntent: candidate.calendarIntent,
      occurrenceFingerprint: candidate.occurrenceFingerprint,
      confidence: candidate.confidence != null ? String(candidate.confidence) : null,
      verificationState: verification,
      populationSource: candidate.populationSource,
      metadata: meta,
      updatedAt: now,
    })
    .returning();

  if (!item) return 'preserved';

  await db.insert(calendarSyncRecords).values({
    calendarItemId: item.id,
    googleCalendarId: 'pending',
    syncStatus: 'benson_only',
    autoUpdateEnabled: false,
    updatedAt: now,
  });

  await linkCuratorLead(candidate, item.id);
  return 'created';
}

async function linkCuratorLead(candidate: PopulationCandidate, calendarItemId: string): Promise<void> {
  const leadId =
    (typeof candidate.metadata?.curatorLeadId === 'string' && candidate.metadata.curatorLeadId) ||
    (candidate.sourceRecordType === 'curator_event_lead' ? candidate.sourceRecordId : null);
  if (!leadId) return;
  // Avoid rewriting curator rows when the link is already correct (idempotent projection).
  const existing = await db
    .select({
      linkedCalendarItemId: curatorEventLeads.linkedCalendarItemId,
      linkedContentItemId: curatorEventLeads.linkedContentItemId,
    })
    .from(curatorEventLeads)
    .where(eq(curatorEventLeads.id, leadId))
    .limit(1);
  const row = existing[0];
  if (!row) return;
  const wantContentId =
    candidate.sourceRecordType === 'content_item' ? candidate.sourceRecordId : null;
  if (
    row.linkedCalendarItemId === calendarItemId &&
    (!wantContentId || row.linkedContentItemId === wantContentId)
  ) {
    return;
  }
  await db
    .update(curatorEventLeads)
    .set({
      linkedCalendarItemId: calendarItemId,
      ...(wantContentId ? { linkedContentItemId: wantContentId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(curatorEventLeads.id, leadId));
}

let inflight: Promise<CalendarBackfillReport> | null = null;

function startWindowProjection(
  fromDate: Date,
  toDate: Date,
  now: Date,
  key: string,
): Promise<CalendarBackfillReport> {
  const existing = getCalendarProjectionInflight(key);
  if (existing) return existing as Promise<CalendarBackfillReport>;
  bumpCalendarProjectionExecutionCount();
  const run = runCalendarInventoryProjection(fromDate, toDate, now)
    .then((report) => {
      noteCalendarProjectionReconciled(key);
      return report;
    })
    .finally(() => {
      setCalendarProjectionInflight(key, null);
      if (inflight === run) inflight = null;
    });
  setCalendarProjectionInflight(key, run);
  inflight = run;
  return run;
}

export async function ensureCalendarInventoryProjections(
  from: Date | string,
  to: Date | string,
  now = new Date(),
): Promise<CalendarBackfillReport> {
  const fromDate = from instanceof Date ? from : new Date(from);
  const toDate = to instanceof Date ? to : new Date(to);
  const key = calendarProjectionWindowKey(fromDate, toDate);
  return startWindowProjection(fromDate, toDate, now, key);
}

export async function scheduleCalendarProjectionForRead(input: {
  from: Date;
  to: Date;
  hasProjectedRows: boolean;
  now?: Date;
}): Promise<CalendarProjectionMode> {
  const key = calendarProjectionWindowKey(input.from, input.to);
  const mode = calendarProjectionReadPlan({
    windowKey: key,
    hasProjectedRows: input.hasProjectedRows,
  });
  if (mode === 'fresh') return 'fresh';
  const run = startWindowProjection(input.from, input.to, input.now ?? new Date(), key);
  if (mode === 'awaited') {
    try {
      await run;
    } catch (err) {
      console.error('[creator-calendar] inventory projection failed', err);
    }
    return 'awaited';
  }
  void run.catch((err) => {
    console.error('[creator-calendar] background inventory projection failed', err);
  });
  return 'background';
}

async function runCalendarInventoryProjection(
  from: Date,
  to: Date,
  now: Date,
): Promise<CalendarBackfillReport> {
  const projectionStarted = nowMs();
  const report: CalendarBackfillReport = {
    scanned: 0,
    eligible: 0,
    rejected: [] as PopulationRejection[],
    stale: 0,
    expired: 0,
    suppressed: 0,
    dismissed: 0,
    skipped: 0,
    duplicates: 0,
    suggestedToCreate: 0,
    tentativeToCreate: 0,
    confirmedToCreate: 0,
    existingPreserved: 0,
    existingUpdated: 0,
    evaluated: 0,
    created: 0,
    updated: 0,
    materiallyUpdated: 0,
    unchanged: 0,
    merged: 0,
    samples: { created: [], rejected: [], preserved: [] },
    dryRun: false,
    ranAt: now.toISOString(),
  };

  const [inventory, curator, existing] = await Promise.all([
    collectInventoryCandidates(from, to, now),
    collectCuratorCandidates(from, to, now),
    loadWindowCalendarItems(from, to),
  ]);

  const dedupeStarted = nowMs();
  const merged = dedupePopulationCandidates([...inventory, ...curator]);
  calendarReadSpan().eligibilityDedupeMs += nowMs() - dedupeStarted;
  report.scanned = inventory.length + curator.length;
  report.eligible = merged.length;
  report.duplicates = Math.max(0, report.scanned - merged.length);

  const fps = merged.flatMap((c) => {
    const skipKey = typeof c.metadata?.skipKey === 'string' ? c.metadata.skipKey : null;
    return [c.occurrenceFingerprint, c.idempotencyKey, skipKey].filter(Boolean) as string[];
  });
  const dismissedStarted = nowMs();
  const dismissed = await loadDismissedFingerprints(fps);
  calendarReadSpan().dismissedLookupMs += nowMs() - dismissedStarted;

  const dismissedExisting = existing.filter(
    (row) => row.planningStatus === 'dismissed' || row.dismissedAt,
  );

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let preserved = 0;
  let skippedDismissed = 0;
  const matchedExistingIds = new Set<string>();

  const upsertStarted = nowMs();
  for (const candidate of merged) {
    const skipKey = typeof candidate.metadata?.skipKey === 'string' ? candidate.metadata.skipKey : null;
    const blocked =
      dismissed.has(candidate.occurrenceFingerprint) ||
      dismissed.has(candidate.idempotencyKey) ||
      (skipKey ? dismissed.has(skipKey) : false);
    if (blocked) {
      skippedDismissed += 1;
      continue;
    }

    const match = findExistingForCandidate(candidate, existing);
    // If the only identity hit is a dismissed tombstone, skip — but never skip when a
    // live suggested/confirmed row already exists for this candidate.
    if (!match || match.planningStatus === 'dismissed' || match.dismissedAt) {
      const incomingIdentity = skipIdentityForCandidate(candidate);
      const dismissedDup = incomingIdentity
        ? dismissedExisting.find((row) => {
            const identity = skipIdentityForRow(row);
            return identity ? calendarIdentitiesMatch(identity, incomingIdentity) : false;
          })
        : null;
      if (dismissedDup && (!match || match.id === dismissedDup.id)) {
        skippedDismissed += 1;
        continue;
      }
    }

    const liveMatch =
      match && match.planningStatus !== 'dismissed' && !match.dismissedAt ? match : null;
    // Prefer live row; if findExisting returned a dismissed row, try again excluding dismissed.
    const upsertTarget =
      liveMatch ??
      findExistingForCandidate(
        candidate,
        existing.filter((row) => row.planningStatus !== 'dismissed' && !row.dismissedAt),
      );

    try {
      const outcome = await upsertSuggestion(candidate, upsertTarget);
      if (upsertTarget) matchedExistingIds.add(upsertTarget.id);
      if (outcome === 'created') {
        created += 1;
        report.samples.created.push({
          title: candidate.title,
          intent: candidate.calendarIntent,
          status: 'suggested',
        });
      } else if (outcome === 'updated') {
        updated += 1;
      } else if (outcome === 'unchanged') {
        unchanged += 1;
      } else {
        preserved += 1;
        report.samples.preserved.push({ title: candidate.title, reason: 'protected_existing' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/duplicate key|unique/i.test(message)) {
        preserved += 1;
        continue;
      }
      throw err;
    }
  }

  const suppressStarted = nowMs();
  const suppressed = await suppressIneligibleSuggestedRows(existing, matchedExistingIds, now);
  calendarReadSpan().upsertsMs += nowMs() - upsertStarted + (nowMs() - suppressStarted);
  calendarReadSpan().upsertCount = created + updated + unchanged + preserved + skippedDismissed + suppressed;
  calendarReadSpan().projectionRan = true;

  report.created = created;
  report.updated = updated;
  report.materiallyUpdated = updated;
  report.unchanged = unchanged;
  report.evaluated = created + updated + unchanged + preserved;
  report.merged = report.duplicates;
  report.existingUpdated = updated;
  report.existingPreserved = preserved + unchanged;
  report.dismissed = skippedDismissed;
  report.suppressed = suppressed;
  report.suggestedToCreate = created;

  if (created > 0 || updated > 0 || suppressed > 0) {
    await emitDataChange({
      eventType: 'calendar_change',
      domains: ['calendar'],
      completedAt: new Date().toISOString(),
      source: 'creator-calendar.inventory-projection',
      success: true,
    });
  }

  calendarReadSpan().projectionMs += nowMs() - projectionStarted;
  return report;
}

/**
 * Unprotected suggested rows that no longer match eligible inventory/curator
 * candidates are dismissed. Confirmed / user-edited / Kellie-owned rows stay.
 */
export function shouldSuppressUnprotectedSuggestion(
  row: Pick<
    CreatorCalendarItem,
    'id' | 'planningStatus' | 'userEditedAt' | 'createdBy' | 'populationSource' | 'title' | 'metadata'
  >,
  matchedExistingIds: Set<string>,
): boolean {
  if (isProtectedCalendarSuggestion(row)) return false;
  if (row.planningStatus !== 'suggested') return false;
  if (matchedExistingIds.has(row.id)) return false;
  // Keep current-rule accepted admissions visible even if candidate matching drifts
  // (display-title changes, dismissed-tombstone collisions).
  const admission = readAdmissionFromMetadata(row.metadata);
  if (
    admission &&
    admission.lifecycle === 'accepted' &&
    admission.ruleVersion === CALENDAR_ADMISSION_RULE_VERSION
  ) {
    return false;
  }
  return true;
}

async function suppressIneligibleSuggestedRows(
  existing: CreatorCalendarItem[],
  matchedExistingIds: Set<string>,
  now: Date,
): Promise<number> {
  let suppressed = 0;
  for (const row of existing) {
    if (!shouldSuppressUnprotectedSuggestion(row, matchedExistingIds)) continue;
    await db
      .update(creatorCalendarItems)
      .set({
        planningStatus: 'dismissed',
        status: 'dismissed',
        dismissedAt: now,
        updatedAt: now,
        metadata: {
          ...((row.metadata as Record<string, unknown> | null) ?? {}),
          suppressedByProjection: true,
          suppressedReason: 'failed_calendar_eligibility',
          suppressedAt: now.toISOString(),
        },
      })
      .where(eq(creatorCalendarItems.id, row.id));
    suppressed += 1;
  }
  return suppressed;
}
