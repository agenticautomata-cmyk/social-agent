/**
 * Re-evaluate all Calendar suggestions with Calendar Admission Authority.
 *
 * Preserves confirmed / user-edited / Kellie-owned rows unless demonstrably corrupt
 * (machine-text leak or confirmed out-of-market). Reports conflicts before changing them.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/migrate-calendar-admission-authority.ts --dry-run
 *   pnpm exec tsx src/scripts/migrate-calendar-admission-authority.ts --apply
 */
import { and, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorCalendarItems, sources } from '../schema.js';
import { normalizeInventoryItem } from '../inventory/normalize.js';
import { inventoryLoadContentItemSelect } from '../inventory/inventory-load-projection.js';
import {
  calendarInventoryExtractedTemporalSelect,
  temporalEvidenceFromCalendarRow,
} from '../creator-calendar/population/inventory-temporal-evidence.js';
import {
  CALENDAR_ADMISSION_RULE_VERSION,
  admissionCandidateFromInventory,
  admissionDecisionToMetadata,
  evaluateCalendarAdmission,
  hasMachineTextLeak,
  isCalendarAccepted,
  readAdmissionFromMetadata,
  type CalendarAdmissionDecision,
} from '../creator-calendar/admission/index.js';
import { isProtectedCalendarSuggestion } from '../creator-calendar/population/sync.js';
import { admissionEntitiesMatch } from '../creator-calendar/admission/entity-resolution.js';
import { isOutOfMarketLocation } from '../ask-benson/url-geo.js';

const apply = process.argv.includes('--apply');
const dryRun = !apply;

type Counts = {
  accepted: number;
  quarantined: number;
  rejected: number;
  merged_duplicate: number;
  candidate: number;
};

const emptyCounts = (): Counts => ({
  accepted: 0,
  quarantined: 0,
  rejected: 0,
  merged_duplicate: 0,
  candidate: 0,
});

function bump(counts: Counts, lifecycle: string): void {
  if (lifecycle in counts) {
    counts[lifecycle as keyof Counts] += 1;
  } else {
    counts.candidate += 1;
  }
}

const report = {
  dryRun,
  ruleVersion: CALENDAR_ADMISSION_RULE_VERSION,
  scanned: 0,
  before: emptyCounts(),
  after: emptyCounts(),
  dismissedSuggestions: 0,
  updatedMetadata: 0,
  mergedPairs: 0,
  protectedConflicts: [] as Array<{ id: string; title: string; reason: string }>,
  dispositions: [] as Array<{
    id: string;
    title: string;
    planningStatus: string;
    lifecycle: string;
    reason: string;
    action: string;
  }>,
  namedExamples: {
    rejected: [] as Array<{ title: string; reason: string }>,
    quarantined: [] as Array<{ title: string; reason: string }>,
    merged: [] as Array<{ survivor: string; absorbed: string }>,
  },
};

function lifecycleFromRow(row: typeof creatorCalendarItems.$inferSelect): string {
  const admission = readAdmissionFromMetadata(row.metadata);
  if (admission) return admission.lifecycle;
  if (row.planningStatus === 'dismissed' || row.dismissedAt) return 'rejected';
  if (row.planningStatus === 'suggested') return 'candidate';
  return 'accepted';
}

const rows = await db.select().from(creatorCalendarItems).where(
  and(
    ne(creatorCalendarItems.planningStatus, 'expired'),
    or(
      eq(creatorCalendarItems.planningStatus, 'suggested'),
      eq(creatorCalendarItems.planningStatus, 'tentative'),
      eq(creatorCalendarItems.planningStatus, 'confirmed'),
    ),
  ),
);

report.scanned = rows.length;
for (const row of rows) bump(report.before, lifecycleFromRow(row));

const contentIds = [
  ...new Set(
    rows
      .filter((r) => r.sourceRecordType === 'content_item' && r.sourceRecordId)
      .map((r) => r.sourceRecordId as string),
  ),
];

const contentRows =
  contentIds.length === 0
    ? []
    : await db
        .select({
          ...inventoryLoadContentItemSelect,
          ...calendarInventoryExtractedTemporalSelect,
          sourceName: sources.name,
          sourceType: sources.type,
        })
        .from(contentItems)
        .leftJoin(sources, eq(sources.id, contentItems.sourceId))
        .where(inArray(contentItems.id, contentIds));

const inventoryById = new Map(
  contentRows.map(
    ({
      sourceName,
      sourceType,
      calendarExtractedEventDate,
      calendarExtractedEventEndDate,
      calendarExtractedStartTime,
      calendarExtractedTitle,
      ...item
    }) => [
      item.id,
      normalizeInventoryItem(item, sourceName, sourceType, {
        temporalEvidence: temporalEvidenceFromCalendarRow({
          calendarExtractedEventDate,
          calendarExtractedEventEndDate,
          calendarExtractedStartTime,
          calendarExtractedTitle,
        }),
      }),
    ],
  ),
);

const now = new Date();
const decisions = new Map<string, CalendarAdmissionDecision>();

for (const row of rows) {
  let decision: CalendarAdmissionDecision;
  // Prefer calendar row place fields when inventory is missing them, so bare
  // "kansas city" on the visible card still quarantines.
  if (row.sourceRecordType === 'content_item' && row.sourceRecordId) {
    const inv = inventoryById.get(row.sourceRecordId);
    if (inv) {
      const candidate = admissionCandidateFromInventory(inv);
      if (!candidate.venue && row.location) candidate.venue = row.location;
      if (!candidate.locationName && row.location) candidate.locationName = row.location;
      if (row.location && /^kansas\s+city$/i.test(row.location.trim())) {
        candidate.locationName = row.location;
        candidate.venue = candidate.venue && !/^kansas\s+city$/i.test(candidate.venue) ? candidate.venue : null;
      }
      decision = evaluateCalendarAdmission(candidate, now);
    } else {
      decision = evaluateCalendarAdmission(
        {
          title: row.title,
          description: row.description,
          venue: row.location,
          locationName: row.location,
          sourceUrl: row.sourceUrl,
          eventDate: row.startAt.toISOString(),
          eventEndDate: row.endAt ? row.endAt.toISOString() : null,
          ingest: row.populationSource,
          userConfirmed: isProtectedCalendarSuggestion(row),
        },
        now,
      );
    }
  } else {
    decision = evaluateCalendarAdmission(
      {
        title: row.title,
        description: row.description,
        venue: row.location,
        locationName: row.location,
        sourceUrl: row.sourceUrl,
        eventDate: row.startAt.toISOString(),
        eventEndDate: row.endAt ? row.endAt.toISOString() : null,
        ingest: row.populationSource,
        userConfirmed: isProtectedCalendarSuggestion(row),
        watchlistVerified: row.populationSource === 'instagram_watchlist',
      },
      now,
    );
  }
  decisions.set(row.id, decision);
}

// Duplicate merge among suggested rows (same entity → keep strongest, dismiss others).
const suggested = rows.filter((r) => r.planningStatus === 'suggested' && !r.dismissedAt);
const absorbed = new Set<string>();
for (let i = 0; i < suggested.length; i += 1) {
  const a = suggested[i]!;
  if (absorbed.has(a.id)) continue;
  for (let j = i + 1; j < suggested.length; j += 1) {
    const b = suggested[j]!;
    if (absorbed.has(b.id)) continue;
    if (
      !admissionEntitiesMatch(
        { title: a.title, startAt: a.startAt.toISOString(), venue: a.location, location: a.location },
        { title: b.title, startAt: b.startAt.toISOString(), venue: b.location, location: b.location },
      )
    ) {
      continue;
    }
    const keep = a;
    const drop = b;
    absorbed.add(drop.id);
    const keepDecision = decisions.get(keep.id)!;
    keepDecision.lifecycle = 'accepted';
    keepDecision.calendarStatus = 'accepted';
    keepDecision.mergedSourceIds = [
      ...(keepDecision.mergedSourceIds ?? []),
      drop.id,
      drop.sourceRecordId ?? '',
    ].filter(Boolean);
    const dropDecision = decisions.get(drop.id)!;
    dropDecision.lifecycle = 'merged_duplicate';
    dropDecision.calendarStatus = 'merged_duplicate';
    dropDecision.primaryReason = 'duplicate_event';
    dropDecision.mergeSurvivorKey = keep.id;
    report.mergedPairs += 1;
    report.namedExamples.merged.push({ survivor: keep.title, absorbed: drop.title });
  }
}

for (const row of rows) {
  const decision = decisions.get(row.id)!;
  bump(report.after, decision.lifecycle);

  const protectedRow = isProtectedCalendarSuggestion(row);
  const corrupt =
    hasMachineTextLeak(row.description) ||
    hasMachineTextLeak(row.title) ||
    (Boolean(row.location) && isOutOfMarketLocation(row.location) && decision.primaryReason === 'outside_service_area');

  if (protectedRow && !isCalendarAccepted(decision) && !corrupt) {
    report.protectedConflicts.push({
      id: row.id,
      title: row.title,
      reason: `${decision.primaryReason}:${decision.detail}`,
    });
    report.dispositions.push({
      id: row.id,
      title: row.title,
      planningStatus: row.planningStatus,
      lifecycle: decision.lifecycle,
      reason: decision.primaryReason,
      action: 'preserve_protected_report_conflict',
    });
    continue;
  }

  const meta = {
    ...((row.metadata as Record<string, unknown> | null) ?? {}),
    ...admissionDecisionToMetadata(decision),
  };

  if (row.planningStatus === 'suggested' && !isCalendarAccepted(decision)) {
    report.dismissedSuggestions += 1;
    report.dispositions.push({
      id: row.id,
      title: row.title,
      planningStatus: row.planningStatus,
      lifecycle: decision.lifecycle,
      reason: decision.primaryReason,
      action: decision.lifecycle === 'merged_duplicate' ? 'dismiss_merged' : 'dismiss_ineligible',
    });
    if (decision.lifecycle === 'rejected' && report.namedExamples.rejected.length < 25) {
      report.namedExamples.rejected.push({ title: row.title, reason: decision.primaryReason });
    }
    if (decision.lifecycle === 'quarantined' && report.namedExamples.quarantined.length < 25) {
      report.namedExamples.quarantined.push({ title: row.title, reason: decision.primaryReason });
    }
    if (!dryRun) {
      await db
        .update(creatorCalendarItems)
        .set({
          planningStatus: 'dismissed',
          status: 'dismissed',
          dismissedAt: now,
          updatedAt: now,
          metadata: {
            ...meta,
            suppressedByAdmissionMigration: true,
            suppressedReason: decision.primaryReason,
            suppressedAt: now.toISOString(),
          },
          ...(decision.display.location ? { location: decision.display.location } : {}),
          ...(decision.display.description !== undefined
            ? { description: decision.display.description }
            : {}),
        })
        .where(eq(creatorCalendarItems.id, row.id));
    }
    continue;
  }

  report.updatedMetadata += 1;
  report.dispositions.push({
    id: row.id,
    title: row.title,
    planningStatus: row.planningStatus,
    lifecycle: decision.lifecycle,
    reason: decision.primaryReason,
    action: 'stamp_admission_metadata',
  });
  if (!dryRun) {
    await db
      .update(creatorCalendarItems)
      .set({
        updatedAt: now,
        metadata: meta,
        ...(isCalendarAccepted(decision) && decision.display.location
          ? { location: decision.display.location }
          : {}),
        ...(isCalendarAccepted(decision) ? { description: decision.display.description } : {}),
        ...(isCalendarAccepted(decision) && decision.display.title
          ? { title: decision.display.title }
          : {}),
      })
      .where(eq(creatorCalendarItems.id, row.id));
  }
}

console.log(JSON.stringify(report, null, 2));
