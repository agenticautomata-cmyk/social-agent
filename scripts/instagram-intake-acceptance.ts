#!/usr/bin/env node
/**
 * Instagram intake acceptance runner.
 *   pnpm exec tsx scripts/instagram-intake-acceptance.ts
 *   pnpm exec tsx scripts/instagram-intake-acceptance.ts --url "https://www.instagram.com/p/..."
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyInstagramProductionSession } from '../services/core/src/curator-watchlist/instagram-session-verify.ts';
import { runInstagramIntakePipeline } from '../services/core/src/curator-watchlist/instagram-intake-pipeline.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadEnv() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch {
    // ignore
  }
}

const DEFAULT_TESTS = [
  {
    label: '1_static_multi_image_carousel',
    url: 'https://www.instagram.com/jasfoodjourney/p/DbLYAWGnLPD/',
  },
  {
    label: '2_static_single_image_flyer',
    url: process.env.IG_TEST_STATIC_SINGLE ?? 'https://www.instagram.com/jasfoodjourney/p/DaUOxJGHMRg/',
  },
  {
    label: '3_reel_text_overlays',
    url: process.env.IG_TEST_REEL_OVERLAY ?? 'https://www.instagram.com/jasfoodjourney/reel/DbUTxc2x0vJ/',
  },
  {
    label: '4_reel_or_video_carousel_spoken',
    url: process.env.IG_TEST_VIDEO_CAROUSEL ?? 'https://www.instagram.com/jasfoodjourney/reel/DajJOgUpXS2/',
  },
];

function printSessionReport(s: Awaited<ReturnType<typeof verifyInstagramProductionSession>>) {
  console.log('\n=== 1. RUNTIME SESSION VERIFY ===');
  console.log(JSON.stringify(s, null, 2));
}

function printStageReport(
  label: string,
  url: string,
  result: Awaited<ReturnType<typeof runInstagramIntakePipeline>>,
) {
  const r = result.report;
  const e = result.evidence;
  console.log(`\n=== ${label.toUpperCase()} ===`);
  console.log(`URL: ${url}`);
  console.log(`pipeline ok: ${result.ok}`);
  console.log(`authenticated account handle: ${e?.profileHandle ?? '(none)'}`);
  console.log(`media type: ${r.mediaType}`);
  console.log(`media items: ${r.carouselItemsDiscovered} (images ${r.imageItemsCaptured}, videos ${r.videoItemsCaptured})`);
  console.log(`caption chars: ${r.captionCharCount}`);
  console.log(`OCR chars: ${r.totalOcrChars}`);
  console.log(`transcript chars: ${r.transcriptCharCount}`);
  console.log(`screenshots: ${r.screenshotsCreated}`);
  console.log(`failure: ${r.failureCode ?? 'none'} @ ${r.failureStage ?? '-'} — ${r.failureDetail ?? ''}`);
  if (r.ocrAttemptedPerItem.length) {
    console.log('OCR/transcript per item:');
    for (const o of r.ocrAttemptedPerItem) {
      console.log(
        `  item ${o.itemIndex + 1} [${o.kind}/${o.source}] chars=${o.charCount} ok=${o.ok} err=${o.error ?? '-'}`,
      );
    }
  }
  if (e?.provenance?.length) {
    console.log(`provenance entries: ${e.provenance.length}`);
    for (const p of e.provenance.slice(0, 8)) {
      console.log(`  ${p.field} ← ${p.source}: ${p.value.slice(0, 80)}${p.value.length > 80 ? '…' : ''}`);
    }
  }
  if (result.text) {
    console.log(`\ncombined text preview (${result.text.length} chars):`);
    console.log(result.text.slice(0, 900) + (result.text.length > 900 ? '\n…' : ''));
  }
}

async function main() {
  await loadEnv();

  const session = await verifyInstagramProductionSession();
  printSessionReport(session);

  const singleUrl = process.argv.find((a, i) => process.argv[i - 1] === '--url');
  const tests = singleUrl
    ? [{ label: 'custom', url: singleUrl }]
    : DEFAULT_TESTS.filter((t) => t.url.trim());

  console.log('\n=== ACCEPTANCE TESTS ===');
  if (tests.length === 0) {
    console.log('No URLs — set IG_TEST_STATIC_SINGLE, IG_TEST_REEL_OVERLAY, IG_TEST_VIDEO_CAROUSEL');
    process.exit(1);
  }

  for (const t of tests) {
    const result = await runInstagramIntakePipeline(t.url);
    printStageReport(t.label, t.url, result);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
