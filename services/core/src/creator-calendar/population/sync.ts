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
      ...item
    }) =>
      normalizeInventoryItem(item, sourceName, sourceType, {
        temporalEvidence: temporalEvidenceFromCalendarRow({
          calendarExtractedEventDate,
          calendarExtractedEventEndDate,
          calendarExtractedStartTime,
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
): Promise<'created' | 'updated' | 'preserved'> {
  const now = new Date();
  if (existing && isProtected(existing)) return 'preserved';

  const title = sanitizeScrapedTitle(candidate.title);
  const description = candidate.description ? sanitizeScrapedText(candidate.description) : null;
  const location = candidate.location ? sanitizeScrapedTitle(candidate.location) : candidate.location ?? null;
  const verification = existing
    ? strongerVerification(existing.verificationState, candidate.verificationState)
    : (candidate.verificationState ?? 'unverified');
  const meta = {
    ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
    ...(candidate.metadata ?? {}),
    whyIncluded: candidate.whyIncluded,
  };

  if (existing) {
    const patch: Partial<typeof creatorCalendarItems.$inferInsert> = {
      updatedAt: now,
      verificationState: verification,
      metadata: meta,
      // Candidate allDay is authoritative for mutable suggestions (isProtected already returned).
      allDay: candidate.allDay ?? false,
    };
    if (candidate.sourceUrl && !existing.sourceUrl) patch.sourceUrl = candidate.sourceUrl;
    if (candidate.internalDetailUrl && !existing.internalDetailUrl) {
      patch.internalDetailUrl = candidate.internalDetailUrl;
    }
    if (location && !existing.location) patch.location = location;
    if (candidate.whyIncluded) patch.notes = candidate.whyIncluded;
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
    if (verificationRank(candidate.verificationState) > verificationRank(existing.verificationState)) {
      if (candidate.sourceUrl) patch.sourceUrl = candidate.sourceUrl;
    }
    await db.update(creatorCalendarItems).set(patch).where(eq(creatorCalendarItems.id, existing.id));
    await linkCuratorLead(candidate, existing.id);
    return 'updated';
  }

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
  await db
    .update(curatorEventLeads)
    .set({
      linkedCalendarItemId: calendarItemId,
      ...(candidate.sourceRecordType === 'content_item'
        ? { linkedContentItemId: candidate.sourceRecordId }
        : {}),
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
    created: 0,
    updated: 0,
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
  let preserved = 0;
  let skippedDismissed = 0;

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

    const incomingIdentity = skipIdentityForCandidate(candidate);
    const dismissedDup = incomingIdentity
      ? dismissedExisting.find((row) => {
          const identity = skipIdentityForRow(row);
          return identity ? calendarIdentitiesMatch(identity, incomingIdentity) : false;
        })
      : null;
    if (dismissedDup) {
      skippedDismissed += 1;
      continue;
    }

    const match = findExistingForCandidate(candidate, existing);
    try {
      const outcome = await upsertSuggestion(candidate, match);
      if (outcome === 'created') {
        created += 1;
        report.samples.created.push({
          title: candidate.title,
          intent: candidate.calendarIntent,
          status: 'suggested',
        });
      } else if (outcome === 'updated') {
        updated += 1;
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

  calendarReadSpan().upsertsMs += nowMs() - upsertStarted;
  calendarReadSpan().upsertCount = created + updated + preserved + skippedDismissed;
  calendarReadSpan().projectionRan = true;

  report.created = created;
  report.updated = updated;
  report.existingUpdated = updated;
  report.existingPreserved = preserved;
  report.dismissed = skippedDismissed;
  report.suggestedToCreate = created;

  if (created > 0 || updated > 0) {
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
