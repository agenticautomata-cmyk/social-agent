#!/usr/bin/env node
/**
 * Fresh-cache newsletter extraction acceptance (10 fixed cases, no compact cache reads).
 *   pnpm --filter @social-agent/core newsletter:fresh-extraction
 */

import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFreshExtractionAcceptance } from '../newsletter-intelligence/fresh-extraction-acceptance.js';
import { shutdownLocalOcrWorker } from '../newsletter-intelligence/local-ocr.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(scriptDir, '../../../../.env') });

async function main() {
  try {
    const report = await runFreshExtractionAcceptance();

    const outDir = resolve(scriptDir, '../../../../reports');
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, `newsletter-fresh-extraction-${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));

    console.log('\n=== FRESH EXTRACTION ACCEPTANCE ===');
    console.log(`Run nonce: ${report.runNonce}`);
    console.log(`Passed: ${report.summary.passed}/${report.summary.total}`);
    console.log(`Report: ${outPath}\n`);

    for (const trace of report.traces) {
      console.log(`--- ${trace.kind} (${trace.pass ? 'PASS' : 'FAIL'}) ---`);
      console.log(`  prefilter: ${trace.prefilter.pass ? 'pass' : trace.prefilter.reason}`);
      console.log(`  sender policy: ${trace.senderPolicy}`);
      console.log(`  LLM: ${trace.llm.primaryOutcome} in=${trace.llm.inputTokens} out=${trace.llm.outputTokens} cacheHit=${trace.llm.extractCacheHit}`);
      console.log(`  extracted: ${trace.extractedItems.length} accepted: ${trace.accepted.length}`);
      if (trace.accepted[0]) {
        const a = trace.accepted[0]!;
        console.log(`  retained: ${a.title} | ${a.date} ${a.time ?? 'all-day'} | ${a.venue ?? ''} ${a.city ?? ''}`);
      }
      if (trace.failures.length) console.log(`  failures: ${trace.failures.join('; ')}`);
    }

    if (!report.passed) {
      process.exit(2);
    }
  } finally {
    await shutdownLocalOcrWorker();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
