/**
 * DB-backed hospitality source registry.
 *
 * Replaces the JSON-only view of sources with rows that carry their own health,
 * schedule and provenance. Two properties matter most:
 *
 *   1. Seeding a source does not make it healthy. `seedSources` writes rows at
 *      `unchecked` and deliberately never touches `health_state` on an existing row.
 *   2. Every extracted fact records the source and URL it came from, so a pitch can
 *      say where it learned something and a stale fact can be superseded rather than
 *      silently overwritten.
 */

import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '../db.js';
import {
  partnershipSourceChecks,
  partnershipSourceFacts,
  partnershipSources,
} from '../schema.js';
import {
  explainHealth,
  nextCheckAt,
  type CheckFrequency,
  type SourceHealthState,
} from './health.js';
import { SOURCE_SEEDS, type SourceSeed } from './seed.js';

export type PartnershipSourceRow = typeof partnershipSources.$inferSelect;

/**
 * Inserts missing sources and refreshes the descriptive fields of existing ones.
 *
 * Health, schedule and failure counters are never written here. Re-running this after
 * editing a seed's `extraction_target` updates the description without pretending the
 * source has been re-verified.
 */
export async function seedSources(
  seeds: SourceSeed[] = SOURCE_SEEDS,
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const seed of seeds) {
    const [existing] = await db
      .select({ id: partnershipSources.id })
      .from(partnershipSources)
      .where(eq(partnershipSources.url, seed.url))
      .limit(1);

    const descriptive = {
      name: seed.name,
      sourceType: seed.sourceType,
      portfolioRelationship: seed.portfolioRelationship,
      representsBusiness: seed.representsBusiness,
      extractionTarget: seed.extractionTarget,
      authorityLevel: seed.authorityLevel,
      leadOrPitch: seed.leadOrPitch,
      geographicRelevance: seed.geographicRelevance,
      checkFrequency: seed.checkFrequency,
      freshnessPolicy: seed.freshnessPolicy,
      alertOnSilence: seed.alertOnSilence,
      requiresPlaywright: seed.requiresPlaywright,
      robotsStatus: seed.robotsStatus,
      robotsNote: seed.robotsNote,
      crawlDelaySeconds: seed.crawlDelaySeconds,
      leadTimeDays: seed.leadTimeDays,
      tier: seed.tier,
      enabled: seed.enabled,
      notes: seed.notes,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(partnershipSources)
        .set(descriptive)
        .where(eq(partnershipSources.id, existing.id));
      updated += 1;
      continue;
    }

    await db.insert(partnershipSources).values({
      url: seed.url,
      ...descriptive,
      // A brand-new source has never been read. It starts unchecked and due now, and
      // a disabled source is honest about why it will never be checked.
      healthState: seed.enabled ? 'unchecked' : 'disabled_not_applicable',
      healthExplanation: explainHealth({
        state: seed.enabled ? 'unchecked' : 'disabled_not_applicable',
        sourceName: seed.name,
        detail: seed.enabled ? null : seed.notes,
      }),
      nextScheduledCheckAt: seed.enabled ? new Date() : null,
    });
    inserted += 1;
  }

  return { inserted, updated };
}

export async function listSources(options: { includeDisabled?: boolean } = {}): Promise<
  PartnershipSourceRow[]
> {
  const where = options.includeDisabled ? undefined : eq(partnershipSources.enabled, true);
  const query = db.select().from(partnershipSources);
  const rows = where ? await query.where(where) : await query;
  return rows.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

export async function getSourceByUrl(url: string): Promise<PartnershipSourceRow | null> {
  const [row] = await db
    .select()
    .from(partnershipSources)
    .where(eq(partnershipSources.url, url))
    .limit(1);
  return row ?? null;
}

/** Sources whose next scheduled check has come due. Disabled sources never come due. */
export async function listSourcesDueForCheck(now = new Date()): Promise<PartnershipSourceRow[]> {
  return db
    .select()
    .from(partnershipSources)
    .where(
      and(
        eq(partnershipSources.enabled, true),
        or(
          isNull(partnershipSources.nextScheduledCheckAt),
          lte(partnershipSources.nextScheduledCheckAt, now),
        ),
      ),
    )
    .orderBy(asc(partnershipSources.tier), asc(partnershipSources.nextScheduledCheckAt));
}

/**
 * Records the outcome of one check, moves the health state, and schedules the next one.
 * `operatorExplanation` is always stored, so the Sources view can explain a non-healthy
 * state without an operator reading logs.
 */
export async function recordSourceCheck(input: {
  sourceId: string;
  sourceName: string;
  frequency: CheckFrequency;
  health: SourceHealthState;
  factsExtracted: number;
  startedAt: Date;
  httpNote?: string | null;
  detail?: string | null;
}): Promise<void> {
  const [current] = await db
    .select({ consecutiveFailures: partnershipSources.consecutiveFailures })
    .from(partnershipSources)
    .where(eq(partnershipSources.id, input.sourceId))
    .limit(1);

  // `dormant`, `robots_refused` and `needs_browser` are honest states, not faults, so
  // they must not accumulate a failure count that would eventually back the source off
  // to a monthly interval for doing exactly what it is supposed to do.
  const isFault = input.health === 'unreachable' || input.health === 'structural_break';
  const consecutiveFailures = isFault ? (current?.consecutiveFailures ?? 0) + 1 : 0;

  const explanation = explainHealth({
    state: input.health,
    sourceName: input.sourceName,
    recordCount: input.factsExtracted,
    detail: input.detail ?? null,
  });

  const now = new Date();
  await db
    .update(partnershipSources)
    .set({
      healthState: input.health,
      healthExplanation: explanation,
      lastCheckAttemptedAt: now,
      // Only a genuinely working read updates the success timestamp. `dormant` counts:
      // the page was read correctly and truthfully had nothing.
      lastSuccessfulCheckAt:
        input.health === 'healthy' || input.health === 'dormant' ? now : undefined,
      consecutiveFailures,
      nextScheduledCheckAt: nextCheckAt({
        frequency: input.frequency,
        health: input.health,
        consecutiveFailures,
        from: now,
      }),
      updatedAt: now,
    })
    .where(eq(partnershipSources.id, input.sourceId));

  await db.insert(partnershipSourceChecks).values({
    sourceId: input.sourceId,
    startedAt: input.startedAt,
    finishedAt: now,
    outcome: input.health,
    factsExtracted: input.factsExtracted,
    operatorExplanation: explanation,
    httpNote: input.httpNote ?? null,
  });
}

export type SourceFactInput = {
  sourceId: string;
  factKind: string;
  /** Stable identity for this fact within the source, so a re-check supersedes rather than duplicates. */
  factKey: string;
  factValue: Record<string, unknown>;
  representsBusiness?: string | null;
  sourceUrl: string;
  /** The actual text this was read from. Provenance for anything a pitch asserts. */
  excerpt?: string | null;
};

/**
 * Upserts a fact. A changed value supersedes the previous one rather than overwriting
 * it, so "the offer used to say X" remains answerable.
 */
export async function recordSourceFact(input: SourceFactInput): Promise<{ changed: boolean }> {
  const [existing] = await db
    .select({
      id: partnershipSourceFacts.id,
      factValue: partnershipSourceFacts.factValue,
    })
    .from(partnershipSourceFacts)
    .where(
      and(
        eq(partnershipSourceFacts.sourceId, input.sourceId),
        eq(partnershipSourceFacts.factKey, input.factKey),
        isNull(partnershipSourceFacts.supersededAt),
      ),
    )
    .limit(1);

  const nextValue = JSON.stringify(input.factValue);
  if (existing && JSON.stringify(existing.factValue) === nextValue) {
    await db
      .update(partnershipSourceFacts)
      .set({ observedAt: new Date() })
      .where(eq(partnershipSourceFacts.id, existing.id));
    return { changed: false };
  }

  if (existing) {
    await db
      .update(partnershipSourceFacts)
      .set({ supersededAt: new Date() })
      .where(eq(partnershipSourceFacts.id, existing.id));
  }

  await db.insert(partnershipSourceFacts).values({
    sourceId: input.sourceId,
    factKind: input.factKind,
    factKey: input.factKey,
    factValue: input.factValue,
    representsBusiness: input.representsBusiness ?? null,
    sourceUrl: input.sourceUrl,
    excerpt: input.excerpt ?? null,
  });
  return { changed: true };
}

/** Current (non-superseded) facts for a source. */
export async function listCurrentFacts(
  sourceId: string,
  factKind?: string,
): Promise<Array<typeof partnershipSourceFacts.$inferSelect>> {
  const conditions = [
    eq(partnershipSourceFacts.sourceId, sourceId),
    isNull(partnershipSourceFacts.supersededAt),
  ];
  if (factKind) conditions.push(eq(partnershipSourceFacts.factKind, factKind));
  return db
    .select()
    .from(partnershipSourceFacts)
    .where(and(...conditions))
    .orderBy(desc(partnershipSourceFacts.observedAt));
}

/** Current facts for a business across every source, for building a pitch. */
export async function listCurrentFactsForBusiness(
  representsBusiness: string,
): Promise<Array<typeof partnershipSourceFacts.$inferSelect>> {
  return db
    .select()
    .from(partnershipSourceFacts)
    .where(
      and(
        sql`lower(${partnershipSourceFacts.representsBusiness}) = lower(${representsBusiness})`,
        isNull(partnershipSourceFacts.supersededAt),
      ),
    )
    .orderBy(desc(partnershipSourceFacts.observedAt));
}

export type SourceHealthSummary = {
  total: number;
  byState: Record<string, number>;
  /** Sources an operator genuinely needs to look at. Excludes honest non-failures. */
  needsAttention: Array<{ name: string; url: string; explanation: string }>;
};

export async function summarizeSourceHealth(): Promise<SourceHealthSummary> {
  const rows = await listSources({ includeDisabled: true });
  const byState: Record<string, number> = {};
  const needsAttention: SourceHealthSummary['needsAttention'] = [];

  for (const row of rows) {
    byState[row.healthState] = (byState[row.healthState] ?? 0) + 1;
    if (row.healthState === 'structural_break' || row.healthState === 'unreachable') {
      needsAttention.push({
        name: row.name,
        url: row.url,
        explanation: row.healthExplanation ?? '',
      });
    }
  }

  return { total: rows.length, byState, needsAttention };
}
