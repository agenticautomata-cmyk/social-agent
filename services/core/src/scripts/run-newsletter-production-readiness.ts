#!/usr/bin/env node
/**
 * Pre-canary production readiness — does not activate canary or process live Gmail.
 *   pnpm --filter @social-agent/core newsletter:production-readiness
 */

import dotenv from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canaryActivationPlanReport } from '../newsletter-intelligence/canary-activation-plan.js';
import {
  canaryReadinessCheck,
  resolveNewsletterPipelineMode,
} from '../newsletter-intelligence/canary-routing.js';
import { compareAgainstLegacyCachedResults } from '../newsletter-intelligence/legacy-comparison.js';
import { auditQualifyingEvents } from '../newsletter-intelligence/event-audit.js';
import { verifyProductionRuntimeOcr } from '../newsletter-intelligence/production-runtime-ocr.js';
import { runTokenEfficientBatch } from '../newsletter-intelligence/pipeline-token-efficient.js';
import { stableBatchEmailSentAt } from '../newsletter-intelligence/batch-email-anchor.js';
import { reconcileTokenUsage } from '../newsletter-intelligence/token-reconciliation.js';
import { assertOutcomeTotalsMatchSample } from '../newsletter-intelligence/outcomes.js';
import {
  finalizeReadinessReport,
  formatEventPrecisionDisplay,
  sendReadinessTelegramIfNew,
} from '../newsletter-intelligence/telegram-readiness-summary.js';
import { env } from '../env.js';

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

async function main() {
  const runId = randomUUID().slice(0, 8);
  const corpus = loadSample();
  const corpusById = new Map(
    corpus.map((c) => [
      c.gmailMessageId,
      { senderEmail: c.senderEmail, senderName: c.senderName, subject: c.subject },
    ]),
  );

  console.log(`[${runId}] Verifying production runtime OCR (host workers path)…`);
  const productionRuntimeOcr = await verifyProductionRuntimeOcr();

  console.log(`[${runId}] Running 50-message token-efficient batch for reconciliation…`);
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

  const tokenReconciliation = reconcileTokenUsage({
    results,
    providerAttempts: providerLedger?.attempts ?? [],
    expectedProviderAttempts: totals.providerCallsAttempted,
  });

  const eventAuditRaw = auditQualifyingEvents({ results, corpusById });
  const precisionDisplay = formatEventPrecisionDisplay(eventAuditRaw);
  const legacyComparison = compareAgainstLegacyCachedResults({
    sampleMessageIds: corpus.map((c) => c.gmailMessageId),
    newResults: results,
  });

  const canary = canaryReadinessCheck();
  const canaryPlan = canaryActivationPlanReport();
  const flagsDisabled =
    !env.NEWSLETTER_TOKEN_EFFICIENT_ENABLED &&
    env.NEWSLETTER_TOKEN_EFFICIENT_CANARY_PERCENT === 0 &&
    !env.NEWSLETTER_TOKEN_EFFICIENT_COMPARISON_MODE;

  const productionWiring = {
    integrated: true,
    integrationPoints: [
      'services/core/src/gmail-inbox/discovery-process.ts (verified subscriptions)',
      'services/core/src/newsletter-intelligence/backfill.ts',
    ],
    pipelineModeDefault: resolveNewsletterPipelineMode(corpus[0]?.gmailMessageId ?? 'probe'),
    flagsDisabled,
    description:
      'Production wiring: legacy active; efficient path installed but disabled',
    rollback: 'Set NEWSLETTER_TOKEN_EFFICIENT_* env vars only — no code deploy required',
    historicalReprocess: false,
    quotaSurfacesAsBlocked: true,
  };

  const report = finalizeReadinessReport({
    runId,
    runAt: new Date().toISOString(),
    sampleSize: corpus.length,
    sampleHash: createHash('sha256')
      .update(corpus.map((c) => c.gmailMessageId).sort().join('\n'))
      .digest('hex')
      .slice(0, 16),
    tokenReconciliation,
    eventAudit: {
      summary: {
        ...eventAuditRaw,
        precisionDisplay,
        passed: eventAuditRaw.passed,
        blockers: eventAuditRaw.blockers,
      },
      events: eventAuditRaw.events,
    },
    legacyComparison,
    productionRuntimeOcr,
    productionWiring,
    canaryPlan,
    proposedCanaryLimits: canaryPlan.proposed,
    canaryReady: canary.ready,
    canaryBlockers: canary.blockers,
    flagsDisabled,
    acceptanceStatus: totals.acceptanceStatus,
  });

  const outDir = resolve(scriptDir, '../../../../reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `newsletter-production-readiness-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n=== PRODUCTION READINESS ===');
  console.log(`Run ID: ${report.runId}`);
  console.log(`Report: ${outPath}`);
  console.log(`Fingerprint: ${report.reportFingerprint}`);
  console.log(report.eventAudit.summary.precisionDisplay.label);
  console.log(`Ready for canary activation: ${report.readyForCanaryActivation}`);

  const telegram = await sendReadinessTelegramIfNew(report);
  console.log(`Telegram: ${telegram.classification}${telegram.duplicateCause ? ` (${telegram.duplicateCause})` : ''}`);

  if (report.remainingBlockers.length) {
    console.error('\nRemaining blockers:', report.remainingBlockers);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
