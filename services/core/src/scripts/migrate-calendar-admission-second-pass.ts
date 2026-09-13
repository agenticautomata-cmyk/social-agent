/**
 * Calendar Admission Authority — second-pass reprocess (rule 2026-09-13.admission.2).
 *
 * - Writes a reversible JSON backup before any production mutations
 * - Re-evaluates non-user-controlled suggestions
 * - Preserves confirmed / manual / Kellie-owned rows unless demonstrably corrupt
 * - Recovers valid quarantines via canonical venue resolver
 * - Rejects false accepts; merges duplicates; does not delete evidence
 *
 * Usage:
 *   pnpm exec tsx src/scripts/migrate-calendar-admission-second-pass.ts --dry-run
 *   pnpm exec tsx src/scripts/migrate-calendar-admission-second-pass.ts --apply
 *   pnpm exec tsx src/scripts/migrate-calendar-admission-second-pass.ts --restore <backup.json>
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray, ne, or } from 'drizzle-orm';
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
  preferAdmissionStartIso,
  readAdmissionFromMetadata,
  type CalendarAdmissionDecision,
} from '../creator-calendar/admission/index.js';
import { isProtectedCalendarSuggestion } from '../creator-calendar/population/sync.js';
import { admissionEntitiesMatch } from '../creator-calendar/admission/entity-resolution.js';
import { isOutOfMarketLocation } from '../ask-benson/url-geo.js';

const apply = process.argv.includes('--apply');
const restoreIdx = process.argv.indexOf('--restore');
const restorePath = restoreIdx >= 0 ? process.argv[restoreIdx + 1] : null;
const dryRun = !apply && !restorePath;

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

function lifecycleFromRow(row: typeof creatorCalendarItems.$inferSelect): string {
  const admission = readAdmissionFromMetadata(row.metadata);
  if (admission) return admission.lifecycle;
  if (row.planningStatus === 'dismissed' || row.dismissedAt) return 'rejected';
  if (row.planningStatus === 'suggested') return 'candidate';
  return 'accepted';
}

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, '../../../../tmp/calendar-admission-backups');

if (restorePath) {
  if (!existsSync(restorePath)) {
    console.error(`Backup not found: ${restorePath}`);
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(restorePath, 'utf8')) as {
    rows: Array<{
      id: string;
      title: string;
      description: string | null;
      location: string | null;
      startAt: string;
      planningStatus: string;
      status: string;
      dismissedAt: string | null;
      sourceUrl: string | null;
      metadata: unknown;
    }>;
  };
  let restored = 0;
  for (const row of backup.rows) {
    await db
      .update(creatorCalendarItems)
      .set({
        title: row.title,
        description: row.description,
        location: row.location,
        startAt: new Date(row.startAt),
        planningStatus: row.planningStatus as typeof creatorCalendarItems.$inferInsert.planningStatus,
        status: row.status,
        dismissedAt: row.dismissedAt ? new Date(row.dismissedAt) : null,
        sourceUrl: row.sourceUrl,
        metadata: row.metadata as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(creatorCalendarItems.id, row.id));
    restored += 1;
  }
  console.log(JSON.stringify({ restored, from: restorePath }, null, 2));
  process.exit(0);
}

const report = {
  dryRun,
  ruleVersion: CALENDAR_ADMISSION_RULE_VERSION,
  backupPath: null as string | null,
  scanned: 0,
  before: emptyCounts(),
  after: emptyCounts(),
  beforeByReason: {} as Record<string, number>,
  afterByReason: {} as Record<string, number>,
  dismissedSuggestions: 0,
  recoveredFromQuarantine: 0,
  newlyRejected: 0,
  updatedMetadata: 0,
  startAtRepairs: 0,
  sourceUrlScrubs: 0,
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
    recovered: [] as Array<{ title: string; reason: string }>,
    merged: [] as Array<{ survivor: string; absorbed: string; startAt: string }>,
  },
};

const rows = await db.select().from(creatorCalendarItems).where(
  and(
    ne(creatorCalendarItems.planningStatus, 'expired'),
    or(
      eq(creatorCalendarItems.planningStatus, 'suggested'),
      eq(creatorCalendarItems.planningStatus, 'tentative'),
      eq(creatorCalendarItems.planningStatus, 'confirmed'),
      eq(creatorCalendarItems.planningStatus, 'dismissed'),
    ),
  ),
);

report.scanned = rows.length;
for (const row of rows) {
  bump(report.before, lifecycleFromRow(row));
  const adm = readAdmissionFromMetadata(row.metadata);
  const reason = adm?.primaryReason ?? 'unstamped';
  report.beforeByReason[reason] = (report.beforeByReason[reason] ?? 0) + 1;
}

// Backup before mutations (always write when --apply; also write dry-run snapshot).
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `calendar-admission-second-pass-${stamp}.json`);
const backupPayload = {
  createdAt: new Date().toISOString(),
  ruleVersionBefore: CALENDAR_ADMISSION_RULE_VERSION,
  rows: rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    location: r.location,
    startAt: r.startAt.toISOString(),
    planningStatus: r.planningStatus,
    status: r.status,
    dismissedAt: r.dismissedAt ? r.dismissedAt.toISOString() : null,
    sourceUrl: r.sourceUrl,
    metadata: r.metadata,
  })),
};
writeFileSync(backupPath, JSON.stringify(backupPayload));
report.backupPath = backupPath;

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
const proposedStartAt = new Map<string, string>();

for (const row of rows) {
  // Skip re-eval of dismissed rows that were never admission-stamped candidates for recovery
  // only when they were user-dismissed (userEdited) — still re-eval projection-suppressed.
  let decision: CalendarAdmissionDecision;
  if (row.sourceRecordType === 'content_item' && row.sourceRecordId) {
    const inv = inventoryById.get(row.sourceRecordId);
    if (inv) {
      const candidate = admissionCandidateFromInventory(inv);
      if (!candidate.venue && row.location) candidate.venue = row.location;
      if (!candidate.locationName && row.location) candidate.locationName = row.location;
      if (row.location && /^kansas\s+city$/i.test(row.location.trim())) {
        candidate.locationName = row.location;
        candidate.venue =
          candidate.venue && !/^kansas\s+city$/i.test(candidate.venue) ? candidate.venue : null;
      }
      // Scrub known-bad source URLs before evaluation so recovered rows don't keep them.
      if (
        candidate.sourceUrl &&
        ((/bpc/i.test(candidate.title) && /sincerely.?her/i.test(candidate.sourceUrl)) ||
          (/exclusive\s+sundays/i.test(candidate.title) && /bridge909\.org/i.test(candidate.sourceUrl)))
      ) {
        candidate.sourceUrl = null;
        report.sourceUrlScrubs += 1;
      }
      decision = evaluateCalendarAdmission(candidate, now);
      if (candidate.eventDate) proposedStartAt.set(row.id, candidate.eventDate);
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
    let sourceUrl = row.sourceUrl;
    if (
      sourceUrl &&
      ((/bpc/i.test(row.title) && /sincerely.?her/i.test(sourceUrl)) ||
        (/exclusive\s+sundays/i.test(row.title) && /bridge909\.org/i.test(sourceUrl)))
    ) {
      sourceUrl = null;
      report.sourceUrlScrubs += 1;
    }
    decision = evaluateCalendarAdmission(
      {
        title: row.title,
        description: row.description,
        venue: row.location,
        locationName: row.location,
        sourceUrl,
        eventDate: row.startAt.toISOString(),
        eventEndDate: row.endAt ? row.endAt.toISOString() : null,
        ingest: row.populationSource,
        userConfirmed: isProtectedCalendarSuggestion(row),
        watchlistVerified: row.populationSource === 'instagram_watchlist',
        attribution:
          typeof (row.metadata as Record<string, unknown> | null)?.attribution === 'string'
            ? ((row.metadata as Record<string, unknown>).attribution as string)
            : null,
      },
      now,
    );
  }
  decisions.set(row.id, decision);
}

// Duplicate merge among suggested (+ recoverable dismissed admission rows).
const mergePool = rows.filter(
  (r) =>
    (r.planningStatus === 'suggested' && !r.dismissedAt) ||
    (r.planningStatus === 'dismissed' &&
      readAdmissionFromMetadata(r.metadata)?.lifecycle === 'quarantined'),
);
const absorbed = new Set<string>();
for (let i = 0; i < mergePool.length; i += 1) {
  const a = mergePool[i]!;
  if (absorbed.has(a.id)) continue;
  for (let j = i + 1; j < mergePool.length; j += 1) {
    const b = mergePool[j]!;
    if (absorbed.has(b.id)) continue;
    if (
      !admissionEntitiesMatch(
        { title: a.title, startAt: a.startAt.toISOString(), venue: a.location, location: a.location },
        { title: b.title, startAt: b.startAt.toISOString(), venue: b.location, location: b.location },
      )
    ) {
      continue;
    }
    // Prefer live suggested as survivor; else stronger title/venue.
    const aLive = a.planningStatus === 'suggested' && !a.dismissedAt;
    const bLive = b.planningStatus === 'suggested' && !b.dismissedAt;
    const keep = aLive && !bLive ? a : !aLive && bLive ? b : a;
    const drop = keep.id === a.id ? b : a;
    absorbed.add(drop.id);
    const keepDecision = decisions.get(keep.id)!;
    const preferredStart = preferAdmissionStartIso(
      { startAt: keep.startAt.toISOString(), title: keep.title, sourceUrl: keep.sourceUrl },
      { startAt: drop.startAt.toISOString(), title: drop.title, sourceUrl: drop.sourceUrl },
    );
    proposedStartAt.set(keep.id, preferredStart);
    keepDecision.lifecycle = 'accepted';
    keepDecision.calendarStatus = 'accepted';
    keepDecision.primaryReason = 'ok';
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
    report.namedExamples.merged.push({
      survivor: keep.title,
      absorbed: drop.title,
      startAt: preferredStart,
    });
  }
}

for (const row of rows) {
  const decision = decisions.get(row.id)!;
  bump(report.after, decision.lifecycle);
  report.afterByReason[decision.primaryReason] =
    (report.afterByReason[decision.primaryReason] ?? 0) + 1;

  const protectedRow = isProtectedCalendarSuggestion(row);
  const corrupt =
    hasMachineTextLeak(row.description) ||
    hasMachineTextLeak(row.title) ||
    (Boolean(row.location) &&
      isOutOfMarketLocation(row.location) &&
      decision.primaryReason === 'outside_service_area');

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

  // Do not resurrect user-dismissed rows (userEditedAt / explicit dismiss without admission suppress).
  const userDismissed =
    row.planningStatus === 'dismissed' &&
    row.userEditedAt != null &&
    !(row.metadata as Record<string, unknown> | null)?.suppressedByProjection &&
    !(row.metadata as Record<string, unknown> | null)?.suppressedByAdmissionMigration;

  if (userDismissed) {
    report.dispositions.push({
      id: row.id,
      title: row.title,
      planningStatus: row.planningStatus,
      lifecycle: decision.lifecycle,
      reason: decision.primaryReason,
      action: 'preserve_user_dismissed',
    });
    continue;
  }

  const meta = {
    ...((row.metadata as Record<string, unknown> | null) ?? {}),
    ...admissionDecisionToMetadata(decision),
  };

  const prevLifecycle = lifecycleFromRow(row);
  const recovering =
    row.planningStatus === 'dismissed' &&
    isCalendarAccepted(decision) &&
    (prevLifecycle === 'quarantined' || prevLifecycle === 'rejected');

  if (recovering) {
    report.recoveredFromQuarantine += 1;
    report.namedExamples.recovered.push({ title: row.title, reason: decision.primaryReason });
    report.dispositions.push({
      id: row.id,
      title: row.title,
      planningStatus: row.planningStatus,
      lifecycle: decision.lifecycle,
      reason: decision.primaryReason,
      action: 'recover_to_suggested',
    });
    if (!dryRun) {
      const startIso = proposedStartAt.get(row.id);
      await db
        .update(creatorCalendarItems)
        .set({
          planningStatus: 'suggested',
          status: 'suggested',
          dismissedAt: null,
          updatedAt: now,
          metadata: {
            ...meta,
            recoveredByAdmissionSecondPass: true,
            recoveredAt: now.toISOString(),
          },
          ...(decision.display.location ? { location: decision.display.location } : {}),
          ...(decision.display.title ? { title: decision.display.title } : {}),
          ...(startIso ? { startAt: new Date(startIso) } : {}),
          // Scrub mismatched sources from display.
          ...((decision.primaryReason === 'ok' &&
            row.sourceUrl &&
            (/sincerely.?her/i.test(row.sourceUrl) || /bridge909\.org/i.test(row.sourceUrl)))
            ? { sourceUrl: null }
            : {}),
        })
        .where(eq(creatorCalendarItems.id, row.id));
    }
    continue;
  }

  if (
    (row.planningStatus === 'suggested' || decision.lifecycle === 'merged_duplicate') &&
    !isCalendarAccepted(decision)
  ) {
    if (prevLifecycle === 'accepted') report.newlyRejected += 1;
    report.dismissedSuggestions += 1;
    report.dispositions.push({
      id: row.id,
      title: row.title,
      planningStatus: row.planningStatus,
      lifecycle: decision.lifecycle,
      reason: decision.primaryReason,
      action: decision.lifecycle === 'merged_duplicate' ? 'dismiss_merged' : 'dismiss_ineligible',
    });
    if (decision.lifecycle === 'rejected' && report.namedExamples.rejected.length < 40) {
      report.namedExamples.rejected.push({ title: row.title, reason: decision.primaryReason });
    }
    if (decision.lifecycle === 'quarantined' && report.namedExamples.quarantined.length < 40) {
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
            admissionSecondPass: true,
          },
          ...(decision.display.location ? { location: decision.display.location } : {}),
          // Clear bad source URLs so UI never shows unrelated View source.
          ...((decision.reasonCodes.includes('source_event_mismatch') ||
            decision.reasonCodes.includes('source_missing_event_evidence'))
            ? { sourceUrl: null }
            : {}),
        })
        .where(eq(creatorCalendarItems.id, row.id));
    }
    continue;
  }

  report.updatedMetadata += 1;
  const startIso = proposedStartAt.get(row.id);
  const startRepair =
    startIso &&
    Math.abs(new Date(startIso).getTime() - row.startAt.getTime()) > 60_000 &&
    isCalendarAccepted(decision);
  if (startRepair) report.startAtRepairs += 1;

  report.dispositions.push({
    id: row.id,
    title: row.title,
    planningStatus: row.planningStatus,
    lifecycle: decision.lifecycle,
    reason: decision.primaryReason,
    action: startRepair ? 'stamp_and_repair_start' : 'stamp_admission_metadata',
  });

  if (!dryRun && (row.planningStatus === 'suggested' || row.planningStatus === 'tentative')) {
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
        ...(startRepair && startIso ? { startAt: new Date(startIso) } : {}),
        ...((row.sourceUrl &&
          (/sincerely.?her/i.test(row.sourceUrl) || /bridge909\.org\/news/i.test(row.sourceUrl)))
          ? { sourceUrl: null }
          : {}),
      })
      .where(eq(creatorCalendarItems.id, row.id));
  }
}

console.log(JSON.stringify(report, null, 2));
