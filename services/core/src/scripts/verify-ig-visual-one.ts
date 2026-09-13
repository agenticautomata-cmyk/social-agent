import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { runInstagramVisualEventReader } from '../curator-watchlist/instagram-visual/orchestrator.js';
import { isCapturedInstagramPostOrReelUrl } from '../curator-watchlist/instagram-url.js';

async function main() {
  const handle = process.argv[2] || 'jasfoodjourney';
  const [row] = await db
    .select()
    .from(sourceWatchers)
    .where(eq(sourceWatchers.canonicalKey, `instagram:account:${handle}`))
    .limit(1);
  if (!row) throw new Error(`missing watcher ${handle}`);
  const r = await runInstagramVisualEventReader({
    watcherId: row.id,
    force: true,
    bounds: {
      maxPosts: 3,
      maxCarouselSlides: 8,
      maxOcrImagesPerPost: 6,
      enableBillableVision: false,
      runTimeoutMs: 300_000,
    },
  });
  console.log(
    JSON.stringify(
      {
        handle,
        status: r.coverage.status,
        summary: r.coverage.summaryLine,
        posts: `${r.coverage.postsInspected}/${r.coverage.postsDiscovered}`,
        slides: `${r.coverage.slidesAcquired}/${r.coverage.slidesExpected}`,
        ocr: r.coverage.slidesOcrSucceeded,
        review: r.coverage.candidatesReview,
        expired: r.coverage.candidatesExpired,
        extracted: r.coverage.candidatesExtracted,
        fabricated: r.candidates.filter((c) => !isCapturedInstagramPostOrReelUrl(c.permalink))
          .length,
        samples: r.candidates
          .filter((c) => c.decisionStage !== 'duplicate')
          .slice(0, 6)
          .map((c) => ({
            title: c.title,
            date: c.eventDate,
            slides: c.slideNumbers,
            permalink: c.permalink,
            stage: c.decisionStage,
          })),
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
