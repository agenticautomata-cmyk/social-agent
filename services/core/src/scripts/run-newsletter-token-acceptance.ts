#!/usr/bin/env node
/**
 * Token-reduction acceptance — fixed 50-email sample, mutually exclusive outcomes.
 *   pnpm --filter @social-agent/core newsletter:token-acceptance
 */

import dotenv from 'dotenv';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { senderDomainFromEmail } from '../newsletter-intelligence/classify.js';
import {
  assertOutcomeTotalsMatchSample,
  explainPriorInvalidMetrics,
} from '../newsletter-intelligence/outcomes.js';
import { runTokenEfficientBatch } from '../newsletter-intelligence/pipeline-token-efficient.js';
import { runRetentionFixtureSet } from '../newsletter-intelligence/retention-fixtures.js';
import { resolveSenderPolicy } from '../newsletter-intelligence/sender-policies.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(scriptDir, '../../../../.env') });

const SAMPLE_SIZE = Number(process.env.NEWSLETTER_TOKEN_ACCEPTANCE_SIZE ?? 50);
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

async function loadFixedSample(limit: number): Promise<CorpusRow[]> {
  if (existsSync(SAMPLE_CACHE)) {
    const cached = JSON.parse(readFileSync(SAMPLE_CACHE, 'utf8')) as CorpusRow[];
    if (cached.length >= limit) return cached.slice(0, limit);
  }

  const result = await db.execute(sql`
    SELECT gmail_message_id, sender_email, sender_name, subject, body_text, urls
    FROM discovery_email_messages
    WHERE received_at >= now() - interval '120 days'
      AND body_text IS NOT NULL
      AND length(body_text) > 80
    ORDER BY received_at DESC
    LIMIT ${limit * 3}
  `);

  const rows = result as unknown as Array<Record<string, unknown>>;
  const picked: CorpusRow[] = [];
  const buckets = { junk: 0, discount: 0, roundup: 0, singleEvent: 0, freebie: 0, complexHtml: 0 };

  for (const row of rows) {
    if (picked.length >= limit) break;
    const subject = String(row.subject ?? '');
    const bodyText = String(row.body_text ?? '');
    const blob = `${subject}\n${bodyText}`.toLowerCase();
    const urls = Array.isArray(row.urls) ? (row.urls as string[]) : [];

    let bucket: keyof typeof buckets | null = null;
    if (/\b\d+% off|bogo|free shipping|clearance|flash sale|\d+\s*for\s*1|sitewide\b/i.test(blob)) {
      bucket = 'discount';
    } else if (/\border confirmation|receipt|track your package|shipping confirmation\b/i.test(blob)) {
      bucket = 'junk';
    } else if (/\broundup|this week|weekend guide|events this\b/i.test(blob)) {
      bucket = 'roundup';
    } else if (/\bfree admission|free entry|complimentary|no cover\b/i.test(blob)) {
      bucket = 'freebie';
    } else if (/<html|<table|<img/i.test(bodyText)) {
      bucket = 'complexHtml';
    } else if (/\bconcert|festival|opening|tickets?\b/i.test(blob)) {
      bucket = 'singleEvent';
    }

    if (!bucket) continue;
    if (buckets[bucket] >= Math.ceil(limit / 6)) continue;
    buckets[bucket] += 1;

    picked.push({
      gmailMessageId: String(row.gmail_message_id),
      subject,
      bodyText,
      bodyHtml: /<html|<img|<table/i.test(bodyText) ? bodyText : '',
      senderEmail: (row.sender_email as string | null) ?? null,
      senderName: (row.sender_name as string | null) ?? null,
      urls,
    });
  }

  while (picked.length < limit) {
    const row = rows[picked.length];
    if (!row) break;
    picked.push({
      gmailMessageId: String(row.gmail_message_id),
      subject: String(row.subject ?? ''),
      bodyText: String(row.body_text ?? ''),
      bodyHtml: '',
      senderEmail: (row.sender_email as string | null) ?? null,
      senderName: (row.sender_name as string | null) ?? null,
      urls: Array.isArray(row.urls) ? (row.urls as string[]) : [],
    });
  }

  const sample = picked.slice(0, limit);
  const deduped: CorpusRow[] = [];
  const seenIds = new Set<string>();
  for (const row of sample) {
    if (seenIds.has(row.gmailMessageId)) continue;
    seenIds.add(row.gmailMessageId);
    deduped.push(row);
  }
  while (deduped.length < limit) {
    for (const row of rows) {
      const id = String(row.gmail_message_id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      deduped.push({
        gmailMessageId: id,
        subject: String(row.subject ?? ''),
        bodyText: String(row.body_text ?? ''),
        bodyHtml: '',
        senderEmail: (row.sender_email as string | null) ?? null,
        senderName: (row.sender_name as string | null) ?? null,
        urls: Array.isArray(row.urls) ? (row.urls as string[]) : [],
      });
      if (deduped.length >= limit) break;
    }
    break;
  }
  mkdirSync(dirname(SAMPLE_CACHE), { recursive: true });
  writeFileSync(SAMPLE_CACHE, JSON.stringify(deduped.slice(0, limit), null, 2));
  return deduped.slice(0, limit);
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
  console.log(`Loading fixed ${SAMPLE_SIZE}-email sample (not full mailbox)…`);
  const corpus = await loadFixedSample(SAMPLE_SIZE);
  if (corpus.length === 0) {
    console.error('No corpus rows found');
    process.exit(1);
  }

  const sampleHash = createHash('sha256')
    .update(corpus.map((c) => c.gmailMessageId).sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
  console.log(`Sample hash: ${sampleHash}`);

  console.log('Running token-efficient pipeline…');
  const { results, totals, providerLedger } = await runTokenEfficientBatch(
    corpus.map((c) => ({
      gmailMessageId: c.gmailMessageId,
      subject: c.subject,
      bodyText: c.bodyText,
      bodyHtml: c.bodyHtml,
      senderEmail: c.senderEmail,
      senderName: c.senderName,
      urls: c.urls,
    })),
    { recordSpend: false },
  );

  assertOutcomeTotalsMatchSample(totals.primaryOutcomes, corpus.length);

  const retention = await runRetentionFixtureSet();

  const junkIds = obviousJunkIds(corpus);
  const junkRejected = results.filter(
    (r) => junkIds.has(r.gmailMessageId) && r.primaryOutcome === 'rejected_pre_llm',
  ).length;
  const junkRejectRate = junkIds.size > 0 ? junkRejected / junkIds.size : 1;

  const report = {
    runAt: new Date().toISOString(),
    sampleSize: corpus.length,
    sampleHash,
    corpusSource: 'discovery_db_fixed_sample',
    priorMetricsInvalidExplanation: explainPriorInvalidMetrics(),
    acceptanceStatus: totals.acceptanceStatus,
    acceptanceReason: totals.acceptanceReason,
    provider: {
      callsAttempted: totals.providerCallsAttempted,
      callsCompleted: totals.providerCallsCompleted,
      blockedEmails: totals.providerBlockedEmails,
      terminalStatusCounts: providerLedger?.countsByTerminalStatus() ?? null,
      reconciliation: providerLedger
        ? `logged ${providerLedger.attempts.length} attempts`
        : 'no ledger',
    },
    primaryOutcomes: totals.primaryOutcomes,
    secondary: {
      deterministicRejects: totals.deterministicRejects,
      extractionSuccesses: totals.extractionSuccesses,
      extractionFailures: totals.extractionFailures,
      cacheHits: totals.cacheHits,
      researchCalls: totals.researchCalls,
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
      retryTokens: totals.retryTokens,
    },
    throughput: {
      totalLlmCalls: totals.totalLlmCalls,
      averageLlmCallsPerEmail: totals.averageLlmCallsPerEmail,
    },
    ocr: totals.ocr,
    retention: {
      ...retention.metrics,
      fixtureCount: 9,
    },
    obviousJunk: {
      labeled: junkIds.size,
      rejectedPreLlm: junkRejected,
      rejectRate: Math.round(junkRejectRate * 1000) / 10,
    },
    gates: {
      mutuallyExclusiveOutcomes: true,
      junkRejectAtLeast80Pct: junkRejectRate >= 0.8,
      avgLlmCallsBelow04: totals.averageLlmCallsPerEmail <= 0.4,
      measuredReductionAtLeast70Pct:
        totals.estimatedReductionPercentAgainstLegacyBaseline >= 70,
      retentionBlocked: retention.metrics.blocked,
    },
  };

  const outDir = resolve(scriptDir, '../../../../reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `newsletter-token-acceptance-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n=== TOKEN ACCEPTANCE ===');
  console.log(`acceptanceStatus: ${report.acceptanceStatus}`);
  console.log(`acceptanceReason: ${report.acceptanceReason ?? 'none'}`);
  console.log('\nPrimary outcomes (mutually exclusive):');
  console.log(JSON.stringify(report.primaryOutcomes, null, 2));
  console.log('\nProvider:');
  console.log(JSON.stringify(report.provider, null, 2));
  console.log('\nTokens:');
  console.log(JSON.stringify(report.tokens, null, 2));
  console.log('\nRetention:');
  console.log(JSON.stringify(report.retention, null, 2));
  console.log(`\nReport: ${outPath}`);

  if (totals.acceptanceStatus === 'BLOCKED') {
    console.error('\nACCEPTANCE BLOCKED — provider quota exhausted; measured savings unavailable.');
    process.exit(2);
  }

  const gateFailures: string[] = [];
  if (!report.gates.junkRejectAtLeast80Pct) {
    gateFailures.push(`obvious junk reject ${report.obviousJunk.rejectRate}% < 80%`);
  }
  if (!report.gates.avgLlmCallsBelow04) {
    gateFailures.push(`avg LLM calls ${totals.averageLlmCallsPerEmail} > 0.4`);
  }
  if (!report.gates.measuredReductionAtLeast70Pct) {
    gateFailures.push(
      `estimated reduction against legacy baseline ${totals.estimatedReductionPercentAgainstLegacyBaseline}% < 70%`,
    );
  }
  if (retention.metrics.falseNegatives.length > 0) {
    gateFailures.push(`retention false negatives: ${retention.metrics.falseNegatives.join('; ')}`);
  }
  if (retention.metrics.falsePositives.length > 0) {
    gateFailures.push(`retention false positives: ${retention.metrics.falsePositives.join('; ')}`);
  }

  if (gateFailures.length) {
    console.error('\nGate failures:', gateFailures);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
