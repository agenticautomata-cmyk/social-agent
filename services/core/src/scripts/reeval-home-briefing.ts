/**
 * Dry-run / apply bounded Home briefing corrections.
 *
 * Protects: user-confirmed, interest, plans, Google calendar, skip/dismiss/suppress, outreach history.
 *
 *   pnpm exec tsx src/scripts/reeval-home-briefing.ts --dry-run
 *   pnpm exec tsx src/scripts/reeval-home-briefing.ts --apply
 */
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, bensonDiscoveries, bensonLearnings, bensonProgressBriefs } from '../schema.js';
import { evaluateHomeCategoryGuard } from '../pre-alpha/home-category-guard.js';
import { looksLikeRawScoutProse, isHomeScoutBatchFresh } from '../pre-alpha/home-scout-surface.js';
import { selectHomeLearningBrief } from '../pre-alpha/home-preference-authority.js';
import { isUnexplainedCumulativeViewsDecline } from '../pre-alpha/home-analytics-coherence.js';

const apply = process.argv.includes('--apply');

type Proposed = {
  kind: string;
  id: string;
  title: string;
  reason: string;
  change: Record<string, unknown>;
};

const report = {
  dryRun: !apply,
  scannedContent: 0,
  proposed: [] as Proposed[],
  applied: 0,
  protectedSkipped: 0,
  learningConflicts: 0,
  staleScoutBatches: 0,
  analyticsAnomalies: 0,
};

async function main() {
  const rows = await db.execute(sql`
    select id, topic, content_category, creator_value_status, lifecycle_status,
           metadata, creator_relevance_explanation
    from content_items
    where creator_value_status in ('creator_candidate','actionable','top_pick')
      and lifecycle_status not in ('expired','archived')
      and (
        coalesce(content_category,'') in ('restaurant_opening','coffee_opening','dining','luxury_dining','hotel package','hotel_package')
        or coalesce(metadata->>'opportunityCategory','') in ('restaurant_opening','coffee_opening','dining','luxury_dining','hotel package','hotel_package')
        or coalesce(metadata::text,'') ilike '%dining or food opening%'
        or coalesce(metadata::text,'') ilike '%date-night or premium%'
        or coalesce(creator_relevance_explanation::text,'') ilike '%dining or food opening%'
        or coalesce(creator_relevance_explanation::text,'') ilike '%date-night or premium%'
      )
    order by updated_at desc nulls last
    limit 200
  `);
  const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
    id: string;
    topic: string;
    content_category: string | null;
    creator_value_status: string;
    lifecycle_status: string;
    metadata: Record<string, unknown> | null;
    creator_relevance_explanation: unknown;
  }>;

  report.scannedContent = list.length;

  for (const row of list) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.userConfirmed === true || meta.explicitInterest === true) {
      report.protectedSkipped += 1;
      continue;
    }
    const why =
      typeof meta.whyItMatters === 'string'
        ? meta.whyItMatters
        : Array.isArray(row.creator_relevance_explanation)
          ? String(row.creator_relevance_explanation[0] ?? '')
          : '';
    const businessName = typeof meta.businessName === 'string' ? meta.businessName : null;
    const effectiveCategory =
      row.content_category ||
      (typeof meta.opportunityCategory === 'string' ? meta.opportunityCategory : null);
    const guard = evaluateHomeCategoryGuard({
      title: row.topic ?? '',
      category: effectiveCategory,
      reason: why,
      businessName,
    });
    if (guard.ok) continue;

    const nextCategory =
      guard.reasonCode === 'law_not_dining'
        ? 'professional_services'
        : guard.reasonCode === 'thrift_not_date_night'
          ? 'thrift_store'
          : guard.reasonCode === 'article_not_restaurant_opening'
            ? 'local_story'
            : guard.reasonCode === 'museum_not_dining' ||
                guard.reasonCode === 'exhibition_not_hotel_package'
              ? 'attraction'
              : guard.reasonCode === 'entertainment_not_dining'
                ? 'entertainment'
                : 'needs_category_review';

    report.proposed.push({
      kind: 'reclassify_content',
      id: row.id,
      title: row.topic ?? '',
      reason: guard.reasonCode ?? 'implausible_category',
      change: {
        fromCategory: effectiveCategory,
        toCategory: nextCategory,
        fromOpportunityCategory: meta.opportunityCategory ?? null,
      },
    });

    if (apply) {
      await db
        .update(contentItems)
        .set({
          contentCategory: nextCategory,
          metadata: sql`coalesce(${contentItems.metadata}, '{}'::jsonb) || ${JSON.stringify({
            homeBriefingReclassifiedAt: new Date().toISOString(),
            homeBriefingReclassifyReason: guard.reasonCode,
            previousContentCategory: row.content_category,
            previousOpportunityCategory: meta.opportunityCategory ?? null,
            opportunityCategory: nextCategory,
            whyItMatters: guard.suggestedLabel
              ? `${guard.suggestedLabel} — verify before pitching.`
              : 'Needs category review.',
          })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, row.id));
      report.applied += 1;
    }
  }

  const [learning] = await db
    .select()
    .from(bensonLearnings)
    .orderBy(desc(bensonLearnings.createdAt))
    .limit(1);
  if (learning) {
    const brief = selectHomeLearningBrief({
      summary: learning.summary,
      insights: (learning.insights ?? []) as Array<{
        id: string;
        insight: string;
        action?: string;
        confidence?: string;
        durability?: string;
        materialChangeSinceLastShown?: boolean;
      }>,
    });
    if (brief.corrected || !brief.show) {
      report.learningConflicts += 1;
      report.proposed.push({
        kind: 'learning_display',
        id: learning.id,
        title: 'latest learning',
        reason: brief.show ? 'summary_reconciled' : 'hide_stale_restatement',
        change: { homeShow: brief.show, statement: brief.statement },
      });
    }
  }

  const [discovery] = await db
    .select()
    .from(bensonDiscoveries)
    .orderBy(desc(bensonDiscoveries.createdAt))
    .limit(1);
  if (discovery) {
    const stale = !isHomeScoutBatchFresh(discovery.createdAt);
    const raw = looksLikeRawScoutProse(discovery.summary);
    if (stale || raw) {
      report.staleScoutBatches += 1;
      report.proposed.push({
        kind: 'stale_scout',
        id: discovery.id,
        title: 'latest discovery batch',
        reason: stale ? 'stale_scout_batch' : 'raw_scout_prose',
        change: { createdAt: discovery.createdAt.toISOString(), suppressFromHome: true },
      });
    }
  }

  const [brief] = await db
    .select()
    .from(bensonProgressBriefs)
    .orderBy(desc(bensonProgressBriefs.createdAt))
    .limit(1);
  if (brief) {
    const payload = brief.brief as { whatChanged?: string[]; progressSummary?: string };
    const lines = payload.whatChanged ?? [];
    if (lines.some((l) => isUnexplainedCumulativeViewsDecline(l))) {
      report.analyticsAnomalies += 1;
      report.proposed.push({
        kind: 'analytics_anomaly',
        id: brief.id,
        title: 'latest pulse brief',
        reason: 'unexplained_cumulative_views_decline',
        change: { suppressFromHomeDisplay: true },
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
