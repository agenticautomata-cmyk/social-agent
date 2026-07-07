/**
 * Audit TikTok video classification quality.
 * Usage: node --import tsx/esm src/scripts/audit-tiktok-classification.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorVideos } from '../schema.js';
import { runAuditOnRows } from '../creator-analytics/classification-audit.js';

async function main() {
  const rows = await db.select().from(creatorVideos).where(eq(creatorVideos.platform, 'tiktok'));
  const live = rows.filter((r) => !r.videoId.startsWith('demo_tt_'));
  const { metrics, confusionMatrix, sample } = runAuditOnRows(rows);

  const businessCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  for (const row of live) {
    if (row.locationTag) {
      locationCounts.set(row.locationTag, (locationCounts.get(row.locationTag) ?? 0) + 1);
    }
    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const bn = meta.businessName;
    if (typeof bn === 'string' && bn.trim()) {
      businessCounts.set(bn.trim(), (businessCounts.get(bn.trim()) ?? 0) + 1);
    }
  }

  const lowConfidence = sample.filter(
    (s) => (s.confidence !== null && s.confidence < 0.45) || !s.categoryOk,
  );

  console.log(
    JSON.stringify(
      {
        metrics,
        confusionMatrix,
        topBusinesses: [...businessCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
        topLocations: [...locationCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
        lowConfidenceCount: lowConfidence.length,
        lowConfidence,
        categoryErrors: sample.filter((s) => !s.categoryOk),
        sample,
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
