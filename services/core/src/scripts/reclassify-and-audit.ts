/**
 * Reclassify all TikTok videos and run before/after audit.
 * Usage: node --import tsx/esm src/scripts/reclassify-and-audit.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorVideos } from '../schema.js';
import { classifyTikTokVideos } from '../creator-analytics/classify-videos.js';
import { runAuditOnRows } from '../creator-analytics/classification-audit.js';

async function loadTikTokRows() {
  return db.select().from(creatorVideos).where(eq(creatorVideos.platform, 'tiktok'));
}

const ORIGINAL_AUDIT_BASELINE = {
  categoryPct: 46,
  locationPct: 94,
  sponsorPct: 46,
  businessRecallPct: 0,
  overallPct: 42,
};

async function main() {
  const beforeRows = await loadTikTokRows();
  const before = runAuditOnRows(beforeRows);

  const reclassify = await classifyTikTokVideos({ onlyMissing: false, force: true });

  const afterRows = await loadTikTokRows();
  const after = runAuditOnRows(afterRows);

  const live = afterRows.filter((r) => !r.videoId.startsWith('demo_tt_'));
  const withBusiness = live.filter((r) => {
    const m = r.metadata as Record<string, unknown> | null;
    return typeof m?.businessName === 'string' && m.businessName.length > 0;
  }).length;

  console.log(
    JSON.stringify(
      {
        reclassify,
        corpus: {
          totalLive: live.length,
          withCategory: live.filter((r) => r.contentCategory).length,
          withLocation: live.filter((r) => r.locationTag).length,
          withBusiness,
          withConfidence: live.filter((r) => {
            const m = r.metadata as Record<string, unknown> | null;
            return typeof m?.confidence === 'number';
          }).length,
        },
        before: {
          metrics: before.metrics,
          confusionMatrix: before.confusionMatrix,
        },
        after: {
          metrics: after.metrics,
          confusionMatrix: after.confusionMatrix,
        },
        comparison: {
          categoryAccuracy: {
            before: `${ORIGINAL_AUDIT_BASELINE.categoryPct}%`,
            after: `${after.metrics.categoryPct}%`,
            delta: `${after.metrics.categoryPct - ORIGINAL_AUDIT_BASELINE.categoryPct}pp`,
          },
          sponsorAccuracy: {
            before: `${ORIGINAL_AUDIT_BASELINE.sponsorPct}%`,
            after: `${after.metrics.sponsorPct}%`,
            delta: `${after.metrics.sponsorPct - ORIGINAL_AUDIT_BASELINE.sponsorPct}pp`,
          },
          businessRecall: {
            before: `${ORIGINAL_AUDIT_BASELINE.businessRecallPct}%`,
            after: `${after.metrics.businessRecallPct}%`,
            delta: `${after.metrics.businessRecallPct - ORIGINAL_AUDIT_BASELINE.businessRecallPct}pp`,
          },
          locationAccuracy: {
            before: `${ORIGINAL_AUDIT_BASELINE.locationPct}%`,
            after: `${after.metrics.locationPct}%`,
            delta: `${after.metrics.locationPct - ORIGINAL_AUDIT_BASELINE.locationPct}pp`,
          },
          overallAccuracy: {
            before: `${ORIGINAL_AUDIT_BASELINE.overallPct}%`,
            after: `${after.metrics.overallPct}%`,
            delta: `${after.metrics.overallPct - ORIGINAL_AUDIT_BASELINE.overallPct}pp`,
          },
        },
        preReclassifySnapshot: {
          metrics: before.metrics,
          confusionMatrix: before.confusionMatrix,
        },
        remainingCategoryErrors: after.sample.filter((s) => !s.categoryOk).slice(0, 15),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
