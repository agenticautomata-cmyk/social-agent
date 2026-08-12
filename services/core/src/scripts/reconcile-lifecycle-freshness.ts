/**
 * Batch 3 reconciliation: one-shot lifecycle recompute for past-dated /
 * prose-stale operator-current rows. Preserves rows and evidence (no delete).
 *
 *   pnpm exec tsx src/scripts/reconcile-lifecycle-freshness.ts
 *   pnpm exec tsx src/scripts/reconcile-lifecycle-freshness.ts --dry-run
 */
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { runLifecycleRecompute } from '../inventory/lifecycle-recompute.js';

const DRY = process.argv.includes('--dry-run');

const STYLE_ENCORE_FIXTURE_ID = '51738b24-5a79-4448-ae92-73f1217faaab';

async function countOperatorCurrentPastDated(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.lifecycleStatus, ['upcoming', 'active', 'expiring_soon']),
        or(isNotNull(contentItems.eventStartsAt), isNotNull(contentItems.eventEndsAt)),
        sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) < NOW()`,
      ),
    );
  return row?.count ?? 0;
}

async function fixtureSnapshot(id: string) {
  const [row] = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      lifecycleStatus: contentItems.lifecycleStatus,
      eventStartsAt: contentItems.eventStartsAt,
      eventEndsAt: contentItems.eventEndsAt,
      script: contentItems.script,
      creatorValueStatus: contentItems.creatorValueStatus,
    })
    .from(contentItems)
    .where(eq(contentItems.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    topic: row.topic,
    lifecycleStatus: row.lifecycleStatus,
    eventStartsAt: row.eventStartsAt,
    eventEndsAt: row.eventEndsAt,
    creatorValueStatus: row.creatorValueStatus,
    scriptPreview: row.script?.slice(0, 200) ?? null,
  };
}

async function main() {
  const beforePastDatedActive = await countOperatorCurrentPastDated();
  const styleEncoreBefore = await fixtureSnapshot(STYLE_ENCORE_FIXTURE_ID);
  const styleEncoreDated = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      lifecycleStatus: contentItems.lifecycleStatus,
      eventStartsAt: contentItems.eventStartsAt,
      eventEndsAt: contentItems.eventEndsAt,
    })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.topic} ilike '%style encore%'`,
        or(isNotNull(contentItems.eventStartsAt), isNotNull(contentItems.eventEndsAt)),
      ),
    )
    .limit(8);

  const futureCurrentBefore = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.lifecycleStatus, ['upcoming', 'active', 'expiring_soon']),
        or(isNotNull(contentItems.eventStartsAt), isNotNull(contentItems.eventEndsAt)),
        sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) >= NOW()`,
      ),
    );

  console.log(
    JSON.stringify(
      {
        dryRun: DRY,
        before: {
          pastDatedStillOperatorCurrent: beforePastDatedActive,
          futureDatedStillOperatorCurrent: futureCurrentBefore[0]?.count ?? 0,
          styleEncore: styleEncoreBefore,
          styleEncoreDatedSample: styleEncoreDated,
        },
      },
      null,
      2,
    ),
  );

  const result = await runLifecycleRecompute({ dryRun: DRY, limit: 50_000 });
  const result2 = DRY
    ? null
    : await runLifecycleRecompute({ dryRun: false, limit: 50_000 });

  const afterPastDatedActive = await countOperatorCurrentPastDated();
  const styleEncoreAfter = await fixtureSnapshot(STYLE_ENCORE_FIXTURE_ID);
  const futureCurrentAfter = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.lifecycleStatus, ['upcoming', 'active', 'expiring_soon']),
        or(isNotNull(contentItems.eventStartsAt), isNotNull(contentItems.eventEndsAt)),
        sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) >= NOW()`,
      ),
    );

  console.log(
    JSON.stringify(
      {
        recompute: result,
        recomputeIdempotentSecondPass: result2,
        after: {
          pastDatedStillOperatorCurrent: afterPastDatedActive,
          futureDatedStillOperatorCurrent: futureCurrentAfter[0]?.count ?? 0,
          styleEncore: styleEncoreAfter,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
