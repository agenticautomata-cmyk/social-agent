/**
 * Batch-resolve opportunity locations for the Opportunity Map.
 *
 * Usage:
 *   LOCATION_PROVIDER=google pnpm --filter @social-agent/core resolve:locations
 *   LOCATION_PROVIDER=google pnpm --filter @social-agent/core resolve:locations -- --limit=200
 *   LOCATION_PROVIDER=google pnpm --filter @social-agent/core resolve:locations -- --dry-run
 */
import 'dotenv/config';
import { and, asc, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { INGEST_RETENTION_DAYS_PAST_EVENT } from '../inventory/retention.js';
import {
  resolveOpportunityLocationWithDiagnostics,
} from '../opportunity-location/service.js';
import { createLocationProvider, isLocationProviderConfigured } from '../opportunity-location/providers/index.js';
import { env } from '../env.js';

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return fallback;
  const n = Number(hit.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dryRun = argFlag('dry-run');
  const limit = argValue('limit', 5_000);
  const delayMs = argValue('delay-ms', 250);

  console.log(`[resolve-locations] provider=${env.LOCATION_PROVIDER} configured=${isLocationProviderConfigured()}`);
  if (env.LOCATION_PROVIDER !== 'google' || !isLocationProviderConfigured()) {
    console.error(
      '[resolve-locations] Set LOCATION_PROVIDER=google and GOOGLE_PLACES_API_KEY before generating map pins.',
    );
    process.exit(1);
  }

  const includeWeak = argFlag('include-weak');
  const days = INGEST_RETENTION_DAYS_PAST_EVENT;
  // Bare metro/neighborhood labels alone do not make useful map pins.
  const weakLocationOnly = sql`(
    LOWER(TRIM(COALESCE(${contentItems.locationName}, ''))) IN (
      'kansas city', 'kc', 'downtown', 'midtown', 'crossroads', 'west bottoms',
      'overland park', 'independence', 'liberty', 'waldo', 'northland',
      'prairie village', 'lees summit', 'lee''s summit', 'raytown', 'shawnee',
      'olenathe', 'olathe', 'kansas city, mo', 'kansas city, missouri',
      'kansas city missouri', 'mo', 'missouri'
    )
    AND COALESCE(${contentItems.metadata}->>'venue', '') = ''
    AND COALESCE(${contentItems.metadata}->>'address', '') = ''
    AND COALESCE(${contentItems.metadata}->>'businessName', '') = ''
  )`;

  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      locationName: contentItems.locationName,
      locationStatus: contentItems.locationStatus,
      eventStartsAt: contentItems.eventStartsAt,
    })
    .from(contentItems)
    .where(
      and(
        isNotNull(contentItems.sourceId),
        sql`(
          COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) IS NULL
          OR COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt})
            >= NOW() - (${days}::int * INTERVAL '1 day')
        )`,
        or(
          sql`${contentItems.locationStatus} IS NULL`,
          sql`${contentItems.locationStatus} IN ('unresolved', 'resolving', 'needs_review')`,
          and(
            sql`${contentItems.locationStatus} IN ('resolved', 'verified')`,
            sql`${contentItems.locationLat} IS NULL`,
          ),
        ),
        or(
          isNotNull(contentItems.locationName),
          sql`COALESCE(${contentItems.metadata}->>'venue', '') <> ''`,
          sql`COALESCE(${contentItems.metadata}->>'address', '') <> ''`,
          sql`COALESCE(${contentItems.metadata}->>'businessName', '') <> ''`,
        ),
        includeWeak ? undefined : sql`NOT ${weakLocationOnly}`,
      ),
    )
    .orderBy(
      // Real venues/addresses first, then soonest events
      sql`(
        CASE
          WHEN COALESCE(${contentItems.metadata}->>'address', '') <> '' THEN 0
          WHEN COALESCE(${contentItems.metadata}->>'venue', '') <> '' THEN 1
          WHEN COALESCE(${contentItems.metadata}->>'businessName', '') <> '' THEN 2
          ELSE 3
        END
      )`,
      asc(sql`COALESCE(${contentItems.eventStartsAt}, ${contentItems.discoveredAt}, ${contentItems.createdAt})`),
    )
    .limit(limit);

  console.log(`[resolve-locations] candidates=${rows.length} dryRun=${dryRun} delayMs=${delayMs}`);
  if (dryRun) {
    for (const row of rows.slice(0, 20)) {
      console.log(`  - ${row.locationStatus ?? 'null'} | ${row.locationName ?? '—'} | ${row.topic.slice(0, 80)}`);
    }
    return;
  }

  const provider = createLocationProvider();
  let resolved = 0;
  let needsReview = 0;
  let unresolved = 0;
  let notApplicable = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    try {
      const { record, providerDiagnostics } = await resolveOpportunityLocationWithDiagnostics(
        row.id,
        provider,
      );
      if (record.locationStatus === 'resolved' || record.locationStatus === 'verified') resolved += 1;
      else if (record.locationStatus === 'needs_review') needsReview += 1;
      else if (record.locationStatus === 'not_applicable') notApplicable += 1;
      else unresolved += 1;

      if ((i + 1) % 25 === 0 || i === 0 || i === rows.length - 1) {
        console.log(
          `[resolve-locations] ${i + 1}/${rows.length} status=${record.locationStatus}` +
            ` http=${providerDiagnostics.httpStatus ?? '—'} ` +
            `"${row.topic.slice(0, 60)}"`,
        );
      }

      if (providerDiagnostics.httpStatus === 429) {
        console.warn('[resolve-locations] rate limited — sleeping 5s');
        await sleep(5_000);
      } else {
        await sleep(delayMs);
      }
    } catch (err) {
      errors += 1;
      console.error(
        `[resolve-locations] failed ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
      await sleep(delayMs);
    }
  }

  console.log(
    `[resolve-locations] done resolved=${resolved} needs_review=${needsReview}` +
      ` unresolved=${unresolved} not_applicable=${notApplicable} errors=${errors}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
