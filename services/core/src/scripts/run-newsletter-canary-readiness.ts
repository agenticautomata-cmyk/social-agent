#!/usr/bin/env node
/**
 * Final safety checks before token-efficient canary (does not enable canary).
 *   pnpm --filter @social-agent/core newsletter:canary-readiness
 */

import dotenv from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canaryReadinessCheck } from '../newsletter-intelligence/canary-routing.js';
import { compareAgainstLegacyCachedResults } from '../newsletter-intelligence/legacy-comparison.js';
import { runOcrMediaProofSuite } from '../newsletter-intelligence/ocr-media-proof.js';
import {
  assertOutcomeTotalsMatchSample,
  explainPriorInvalidMetrics,
} from '../newsletter-intelligence/outcomes.js';
import { runTokenEfficientBatch } from '../newsletter-intelligence/pipeline-token-efficient.js';
import { stableBatchEmailSentAt } from '../newsletter-intelligence/batch-email-anchor.js';
import {
  explainUnreconciledAttempts,
  type ProviderAttemptRecord,
} from '../newsletter-intelligence/provider-attempts.js';
import { runRetentionFixtureSet } from '../newsletter-intelligence/retention-fixtures.js';
import { resolveSenderPolicy } from '../newsletter-intelligence/sender-policies.js';
import { senderDomainFromEmail } from '../newsletter-intelligence/classify.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(scriptDir, '../../../../.env') });

const SAMPLE_CACHE = resolve(scriptDir, '../../../../.cache/newsletter-acceptance-sample.json');

type CorpusRow = {
  gmailMessageId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  senderEmail: string | null;
  senderName: string | null;
  urls: string[];
};

function loadSample(): CorpusRow[] {
  if (!existsSync(SAMPLE_CACHE)) {
    throw new Error(`Missing sample cache: ${SAMPLE_CACHE}`);
  }
  return JSON.parse(readFileSync(SAMPLE_CACHE, 'utf8')) as CorpusRow[];
}

function obviousJunkIds(corpus: CorpusRow[]): Set<string> {
  return new Set(
    corpus
      .filter((c) => {
        const blob = `${c.subject}\n${c.bodyText}`;
        if (
          !/\b\d+% off|bogo|free shipping|order confirmation|receipt|track your package|clearance|flash sale|\d+\s*for\s*1|sitewide\b/i.test(
            blob,
          )
        ) {
          return false;
        }
        const policy = resolveSenderPolicy(c.senderEmail, senderDomainFromEmail(c.senderEmail) ?? undefined);
        return policy.policy !== 'trusted_event_roundup';
      })
      .map((c) => c.gmailMessageId),
  );
}

async function main() {
  const corpus = loadSample();
  const sampleHash = createHash('sha256')
    .update(corpus.map((c) => c.gmailMessageId).sort().join('\n'))
    .digest('hex')
    .slice(0, 16);

  console.log('Running binary OCR media proof fixtures (before batch load)…');
  const ocrProof = await runOcrMediaProofSuite();

  console.log('Running token-efficient batch with provider ledger…');
  const { results, totals, providerLedger } = await runTokenEfficientBatch(
    corpus.map((c) => ({
      ...c,
      bodyHtml: c.bodyHtml || '',
      urls: c.urls || [],
      emailSentAt: stableBatchEmailSentAt(c.gmailMessageId),
    })),
    { recordSpend: false },
  );

  assertOutcomeTotalsMatchSample(totals.primaryOutcomes, corpus.length);

  const retention = await runRetentionFixtureSet();
  const legacyComparison = compareAgainstLegacyCachedResults({
    sampleMessageIds: corpus.map((c) => c.gmailMessageId),
    newResults: results,
  });

  const canary = canaryReadinessCheck();
  const junkIds = obviousJunkIds(corpus);
  const junkRejected = results.filter(
    (r) => junkIds.has(r.gmailMessageId) && r.primaryOutcome === 'rejected_pre_llm',
  ).length;

  const providerTerminal = providerLedger?.countsByTerminalStatus() ?? null;
  const providerAttempts = providerLedger?.attempts ?? [];

  const blockers: string[] = [...canary.blockers];
  if (totals.acceptanceStatus === 'BLOCKED') blockers.push('acceptance BLOCKED (provider quota)');
  if (retention.metrics.falseNegatives.length) {
    blockers.push(`retention false negatives: ${retention.metrics.falseNegatives.join('; ')}`);
  }
  if (legacyComparison.meaningfulLosses.length) {
    blockers.push(
      `meaningful legacy losses: ${legacyComparison.meaningfulLosses.map((l) => l.title).join('; ')}`,
    );
  }
  if (!ocrProof.png.pass) blockers.push(`PNG OCR proof: ${ocrProof.png.failures.join(', ')}`);
  if (!ocrProof.pdf.pass) blockers.push(`PDF OCR proof: ${ocrProof.pdf.failures.join(', ')}`);

  const report = {
    runAt: new Date().toISOString(),
    sampleSize: corpus.length,
    sampleHash,
    priorMetricsInvalidExplanation: explainPriorInvalidMetrics(),
    dateNormalization: {
      policy: 'explicit past absolute dates are never rolled forward; stale -> rejected_stale_date or needs_verification',
      tests: 'services/core/src/newsletter-intelligence/date-normalize.test.ts',
    },
    tokens: {
      legacyEstimatedTokens: totals.legacyEstimatedTokens,
      legacyMeasuredTokens: totals.legacyMeasuredTokens,
      newEstimatedTokens: totals.newEstimatedTokens,
      newMeasuredInputTokens: totals.newMeasuredInputTokens,
      newMeasuredOutputTokens: totals.newMeasuredOutputTokens,
      newMeasuredTotalTokens: totals.newMeasuredTotalTokens,
      measuredReductionPercent: totals.measuredReductionPercent,
      estimatedReductionPercent: totals.estimatedReductionPercent,
      estimatedReductionPercentAgainstLegacyBaseline:
        totals.estimatedReductionPercentAgainstLegacyBaseline,
      note: 'estimatedReductionPercentAgainstLegacyBaseline compares measured new tokens to estimated legacy baseline — not dual-measured',
    },
    provider: {
      callsAttempted: totals.providerCallsAttempted,
      callsCompleted: totals.providerCallsCompleted,
      blockedEmails: totals.providerBlockedEmails,
      terminalStatusCounts: providerTerminal,
      attempts: providerAttempts as ProviderAttemptRecord[],
      reconciliation: explainUnreconciledAttempts({
        callsAttempted: totals.providerCallsAttempted,
        callsCompleted: totals.providerCallsCompleted,
        blockedEmails: totals.providerBlockedEmails,
        extractionFailures: totals.extractionFailures,
        ledger: providerLedger,
      }),
    },
    primaryOutcomes: totals.primaryOutcomes,
    retention: retention.metrics,
    legacyComparison,
    ocrProof,
    obviousJunk: {
      labeled: junkIds.size,
      rejectedPreLlm: junkRejected,
      rejectRate: junkIds.size ? Math.round((junkRejected / junkIds.size) * 1000) / 10 : 100,
    },
    canary,
    remainingBlockers: blockers,
    readyForCanaryActivation: blockers.length === 0,
  };

  const outDir = resolve(scriptDir, '../../../../reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `newsletter-canary-readiness-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n=== CANARY READINESS ===');
  console.log(`readyForCanaryActivation: ${report.readyForCanaryActivation}`);
  console.log('\nTokens:');
  console.log(JSON.stringify(report.tokens, null, 2));
  console.log('\nProvider reconciliation:');
  console.log(report.provider.reconciliation);
  console.log('\nOCR proof:');
  console.log(JSON.stringify({ png: ocrProof.png, pdf: ocrProof.pdf }, null, 2));
  console.log('\nLegacy comparison:');
  console.log(JSON.stringify(legacyComparison, null, 2));
  console.log(`\nReport: ${outPath}`);

  if (blockers.length) {
    console.error('\nRemaining blockers:', blockers);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
