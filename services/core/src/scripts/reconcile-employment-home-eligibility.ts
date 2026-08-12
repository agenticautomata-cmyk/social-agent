/**
 * Batch 2 reconciliation: demote employment/jobs/careers rows currently
 * visible as creator_candidate|actionable|top_pick to hidden_raw_signal so
 * they leave the Home inventory pool. Preserves rows (no delete).
 *
 *   pnpm exec tsx src/scripts/reconcile-employment-home-eligibility.ts
 *   pnpm exec tsx src/scripts/reconcile-employment-home-eligibility.ts --dry-run
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { isEmploymentOpportunity } from '../creator-agent/employment-intent.js';

const DRY = process.argv.includes('--dry-run');

async function main() {
  const list = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      script: contentItems.script,
      creatorValueStatus: contentItems.creatorValueStatus,
      sourceUrl: contentItems.sourceUrl,
      metadata: contentItems.metadata,
      creatorRelevanceExplanation: contentItems.creatorRelevanceExplanation,
    })
    .from(contentItems)
    .where(inArray(contentItems.creatorValueStatus, ['creator_candidate', 'actionable', 'top_pick']))
    .limit(5000);

  const targets = list.filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const category =
      typeof meta.opportunityCategory === 'string' ? meta.opportunityCategory : null;
    return isEmploymentOpportunity({
      title: row.topic,
      category,
      sourceUrl: row.sourceUrl,
      summary: row.script,
      metadata: meta,
    });
  });

  console.log(
    JSON.stringify(
      {
        dryRun: DRY,
        scanned: list.length,
        employmentVisible: targets.length,
        sample: targets.slice(0, 10).map((t) => ({
          id: t.id,
          topic: t.topic,
          status: t.creatorValueStatus,
        })),
      },
      null,
      2,
    ),
  );

  if (DRY || targets.length === 0) {
    console.log(DRY ? 'DRY RUN — no writes' : 'Nothing to reconcile');
    return;
  }

  let updated = 0;
  for (const target of targets) {
    const prev = Array.isArray(target.creatorRelevanceExplanation)
      ? target.creatorRelevanceExplanation
      : [];
    const next = [
      ...prev.filter((x) => typeof x === 'string'),
      'reconcile:employment_home_ineligible_batch2',
    ];
    await db
      .update(contentItems)
      .set({
        creatorValueStatus: 'hidden_raw_signal',
        creatorRelevanceExplanation: next,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contentItems.id, target.id),
          inArray(contentItems.creatorValueStatus, ['creator_candidate', 'actionable', 'top_pick']),
        ),
      );
    updated += 1;
  }

  console.log(JSON.stringify({ updated, ids: targets.map((t) => t.id) }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
