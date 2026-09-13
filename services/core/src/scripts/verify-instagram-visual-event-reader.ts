/**
 * Live Instagram visual event reader verification for configured Watchlist accounts.
 * Local OCR only — does not enable billable vision.
 *
 * Usage:
 *   cd services/core && pnpm exec tsx src/scripts/verify-instagram-visual-event-reader.ts
 */

import { eq, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers, curatorEventLeads } from '../schema.js';
import { runInstagramVisualEventReader } from '../curator-watchlist/instagram-visual/orchestrator.js';
import { isCapturedInstagramPostOrReelUrl } from '../curator-watchlist/instagram-url.js';
import { ensureCuratorWatcher } from '../curator-watchlist/pipeline.js';

const ACCEPTANCE = ['bizzybodyb007', 'jasfoodjourney'] as const;
const ADDITIONAL = ['boonetheater', 'swittscajuncuisine', 'hookedonkc', 'lzwegotone'] as const;

async function findWatcher(handle: string) {
  const key = `instagram:account:${handle.toLowerCase()}`;
  const [row] = await db
    .select()
    .from(sourceWatchers)
    .where(
      or(
        eq(sourceWatchers.canonicalKey, key),
        sql`${sourceWatchers.sourceUrl} ilike ${'%' + handle + '%'}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

async function ensureHandles(handles: readonly string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const handle of handles) {
    let row = await findWatcher(handle);
    if (!row) {
      const id = await ensureCuratorWatcher(`https://www.instagram.com/${handle}/`);
      row = await findWatcher(handle);
      console.log(`ensured watcher @${handle} → ${id}`);
    }
    if (row) map.set(handle, row.id);
  }
  return map;
}

type AccountReport = {
  handle: string;
  ok: boolean;
  coverageStatus: string;
  summary: string;
  postsDiscovered: number;
  postsInspected: number;
  slidesExpected: number;
  slidesAcquired: number;
  ocrSucceeded: number;
  candidates: number;
  future: number;
  expired: number;
  review: number;
  rejected: number;
  duplicates: number;
  sampleEvents: Array<{
    title: string | null;
    date: string | null;
    venue: string | null;
    permalink: string;
    slides: number[];
    temporal: string;
    stage: string;
  }>;
  fabricatedPermalinks: number;
  secondRunDupes: number;
  error?: string;
};

async function runAccount(handle: string, watcherId: string): Promise<AccountReport> {
  console.log(`\n=== @${handle} visual reader ===`);
  const first = await runInstagramVisualEventReader({
    watcherId,
    force: true,
    bounds: {
      maxPosts: 4,
      maxCarouselSlides: 8,
      maxOcrImagesPerPost: 6,
      enableBillableVision: false,
      runTimeoutMs: 360_000,
    },
  });

  // Skip redundant curator pipeline here — visual reader is the coverage authority.
  // (Pipeline still runs on Watchlist scheduler / Check now.)

  const second = await runInstagramVisualEventReader({
    watcherId,
    force: false,
    bounds: { maxPosts: 4, enableBillableVision: false, runTimeoutMs: 120_000 },
  });

  const fabricated = first.candidates.filter((c) => !isCapturedInstagramPostOrReelUrl(c.permalink)).length;
  const sampleEvents = first.candidates
    .filter((c) => c.decisionStage !== 'duplicate')
    .slice(0, 8)
    .map((c) => ({
      title: c.title,
      date: c.eventDate,
      venue: c.venue,
      permalink: c.permalink,
      slides: c.slideNumbers,
      temporal: c.temporalClass,
      stage: c.decisionStage,
    }));

  const report: AccountReport = {
    handle,
    ok: first.ok,
    coverageStatus: first.coverage.status,
    summary: first.coverage.summaryLine,
    postsDiscovered: first.coverage.postsDiscovered,
    postsInspected: first.coverage.postsInspected,
    slidesExpected: first.coverage.slidesExpected,
    slidesAcquired: first.coverage.slidesAcquired,
    ocrSucceeded: first.coverage.slidesOcrSucceeded,
    candidates: first.coverage.candidatesExtracted + first.coverage.candidatesReview,
    future: first.coverage.candidatesFuture,
    expired: first.coverage.candidatesExpired,
    review: first.coverage.candidatesReview,
    rejected: first.coverage.candidatesRejected,
    duplicates: first.coverage.duplicatesSkipped,
    sampleEvents,
    fabricatedPermalinks: fabricated,
    secondRunDupes: second.coverage.candidatesExtracted,
    error: first.ok ? undefined : first.coverage.incompleteReason ?? first.coverage.summaryLine,
  };

  console.log(JSON.stringify({
    handle,
    status: report.coverageStatus,
    summary: report.summary,
    posts: `${report.postsInspected}/${report.postsDiscovered}`,
    slides: `${report.slidesAcquired}/${report.slidesExpected}`,
    ocr: report.ocrSucceeded,
    candidates: report.candidates,
    expired: report.expired,
    review: report.review,
    fabricated: report.fabricatedPermalinks,
    secondRunNewExtracted: report.secondRunDupes,
  }, null, 2));

  return report;
}

async function main() {
  const wanted = [...ACCEPTANCE, ...ADDITIONAL.slice(0, 3)];
  const watchers = await ensureHandles(wanted);
  const reports: AccountReport[] = [];

  for (const handle of wanted) {
    const id = watchers.get(handle);
    if (!id) {
      reports.push({
        handle,
        ok: false,
        coverageStatus: 'failed',
        summary: 'watcher_missing',
        postsDiscovered: 0,
        postsInspected: 0,
        slidesExpected: 0,
        slidesAcquired: 0,
        ocrSucceeded: 0,
        candidates: 0,
        future: 0,
        expired: 0,
        review: 0,
        rejected: 0,
        duplicates: 0,
        sampleEvents: [],
        fabricatedPermalinks: 0,
        secondRunDupes: 0,
        error: 'watcher_missing',
      });
      continue;
    }
    try {
      reports.push(await runAccount(handle, id));
    } catch (err) {
      reports.push({
        handle,
        ok: false,
        coverageStatus: 'failed',
        summary: err instanceof Error ? err.message : 'run_failed',
        postsDiscovered: 0,
        postsInspected: 0,
        slidesExpected: 0,
        slidesAcquired: 0,
        ocrSucceeded: 0,
        candidates: 0,
        future: 0,
        expired: 0,
        review: 0,
        rejected: 0,
        duplicates: 0,
        sampleEvents: [],
        fabricatedPermalinks: 0,
        secondRunDupes: 0,
        error: err instanceof Error ? err.message : 'run_failed',
      });
    }
  }

  // Lead counts for acceptance accounts
  for (const handle of ACCEPTANCE) {
    const id = watchers.get(handle);
    if (!id) continue;
    const leads = await db
      .select({
        name: curatorEventLeads.eventName,
        date: curatorEventLeads.eventDate,
        status: curatorEventLeads.verificationStatus,
        url: curatorEventLeads.discoveredViaPostUrl,
      })
      .from(curatorEventLeads)
      .where(eq(curatorEventLeads.watcherId, id))
      .limit(20);
    console.log(`\n@${handle} stored leads (sample ${leads.length}):`);
    for (const l of leads.slice(0, 8)) {
      console.log(`  - ${l.name} | ${l.date} | ${l.status} | ${l.url}`);
    }
  }

  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(JSON.stringify(reports, null, 2));

  const bizzy = reports.find((r) => r.handle === 'bizzybodyb007');
  const jas = reports.find((r) => r.handle === 'jasfoodjourney');
  const failures: string[] = [];
  if (!bizzy?.ok && bizzy?.coverageStatus === 'session_required') {
    failures.push('bizzy session_required');
  }
  if ((bizzy?.fabricatedPermalinks ?? 0) > 0) failures.push('bizzy fabricated permalinks');
  if ((jas?.fabricatedPermalinks ?? 0) > 0) failures.push('jas fabricated permalinks');

  if (failures.length) {
    console.error('Verification issues:', failures);
    process.exitCode = 1;
  } else {
    console.log('Verification completed (see coverage statuses — partial is honest when incomplete).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
