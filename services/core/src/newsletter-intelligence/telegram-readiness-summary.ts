/**
 * Telegram readiness summary — single source of truth for gate status and messaging.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EventAuditReport } from './event-audit.js';
import type { TokenReconciliationReport } from './token-reconciliation.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';

const CACHE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache',
);
const LOCK_PATH = resolve(CACHE_DIR, 'newsletter-readiness-telegram.lock');
const LAST_SENT_PATH = resolve(CACHE_DIR, 'newsletter-readiness-telegram-last.json');

export type GateStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'N/A' | 'UNRECONCILED';

export type EventPrecisionDisplay = {
  label: string;
  status: GateStatus;
  validCount: number;
  auditedCount: number;
  precision: number | null;
};

export type ProductionReadinessReport = {
  runId: string;
  runAt: string;
  sampleSize: number;
  sampleHash: string;
  tokenReconciliation: TokenReconciliationReport;
  eventAudit: {
    summary: EventAuditReport & {
      precisionDisplay: EventPrecisionDisplay;
      passed: boolean;
      blockers: string[];
    };
    /** Audit rows omit raw Gmail IDs in Telegram; kept in JSON report only as hashes. */
    events: EventAuditReport['events'];
  };
  productionRuntimeOcr: { passed: boolean; runtime: string; blockers: string[] };
  productionWiring: {
    integrated: boolean;
    pipelineModeDefault: string;
    flagsDisabled: boolean;
    description: string;
  };
  remainingBlockers: string[];
  readyForCanaryActivation: boolean;
  canaryReadinessNote: string;
  reportFingerprint: string;
  [key: string]: unknown;
};

function gateFromBoolean(pass: boolean | null | undefined, blocked = false): GateStatus {
  if (blocked) return 'BLOCKED';
  if (pass == null) return 'N/A';
  return pass ? 'PASS' : 'FAIL';
}

export function formatEventPrecisionDisplay(audit: EventAuditReport): EventPrecisionDisplay {
  const auditedCount = audit.events.length;
  const validCategories = ['valid_complete_event', 'true_freebie', 'tiktok_worthy_event'] as const;
  const validCount = audit.events.filter((e) =>
    (validCategories as readonly string[]).includes(e.category),
  ).length;

  if (auditedCount === 0) {
    return {
      label: 'Event precision: N/A (0 audited events)',
      status: 'N/A',
      validCount: 0,
      auditedCount: 0,
      precision: null,
    };
  }

  const precision = validCount / auditedCount;
  if (!Number.isFinite(precision)) {
    return {
      label: 'Event precision: BLOCKED — audit denominator unavailable',
      status: 'BLOCKED',
      validCount,
      auditedCount,
      precision: null,
    };
  }

  const pct = Math.round(precision * 1000) / 10;
  return {
    label: `Event precision: ${validCount}/${auditedCount} = ${pct}%`,
    status: precision >= 0.9 ? 'PASS' : 'FAIL',
    validCount,
    auditedCount,
    precision,
  };
}

export function computeReadinessBlockers(input: {
  canaryReady: boolean;
  canaryBlockers: string[];
  tokenReconciliation: TokenReconciliationReport;
  eventAudit: EventAuditReport;
  precisionDisplay: EventPrecisionDisplay;
  productionRuntimeOcr: { passed: boolean; blockers: string[] };
  flagsDisabled: boolean;
  acceptanceStatus?: 'PASSED' | 'FAILED' | 'BLOCKED';
}): string[] {
  const blockers: string[] = [];

  if (!input.canaryReady) blockers.push(...input.canaryBlockers);
  if (input.tokenReconciliation.errors.length) {
    blockers.push(...input.tokenReconciliation.errors);
  }
  if (!input.tokenReconciliation.assertions.providerAttemptsReconcile) {
    blockers.push('provider attempt reconciliation failed');
  }
  if (!input.tokenReconciliation.assertions.inputTokensSumMatches) {
    blockers.push('input token totals unreconciled');
  }
  if (
    input.tokenReconciliation.totals.outputTokensKnown &&
    !input.tokenReconciliation.assertions.outputTokensSumMatches
  ) {
    blockers.push('output token totals unreconciled');
  }
  if (input.acceptanceStatus === 'BLOCKED') {
    blockers.push('acceptance status BLOCKED (provider quota)');
  }

  const pd = input.precisionDisplay;
  if (pd.status === 'BLOCKED') {
    blockers.push('event audit precision unavailable');
  } else if (pd.status === 'FAIL') {
    blockers.push(`event audit precision below threshold (${pd.label})`);
  } else if (pd.status === 'N/A' && input.eventAudit.events.length === 0) {
    blockers.push('no auditable accepted events');
  }

  if (!input.eventAudit.passed) {
    for (const b of input.eventAudit.blockers) {
      if (!blockers.includes(b)) blockers.push(b);
    }
  }

  if (!input.productionRuntimeOcr.passed) {
    blockers.push(...input.productionRuntimeOcr.blockers);
  }
  if (!input.flagsDisabled) {
    blockers.push('token-efficient flags must remain disabled before canary');
  }

  return [...new Set(blockers)];
}

export function computeReportFingerprint(input: {
  sampleHash: string;
  blockers: string[];
  precisionStatus: GateStatus;
  runtimePassed: boolean;
  wiringFlagsDisabled: boolean;
  reconciliationOk: boolean;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sampleHash: input.sampleHash,
        blockers: [...input.blockers].sort(),
        precisionStatus: input.precisionStatus,
        runtimePassed: input.runtimePassed,
        wiringFlagsDisabled: input.wiringFlagsDisabled,
        reconciliationOk: input.reconciliationOk,
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

export function formatTelegramReadinessSummary(report: ProductionReadinessReport): string {
  const tokens = report.tokenReconciliation.totals;
  const sources = report.tokenReconciliation.eventSources;
  const pd = report.eventAudit.summary.precisionDisplay;
  const runtimeStatus = gateFromBoolean(report.productionRuntimeOcr.passed);
  const reconcileOk =
    report.tokenReconciliation.assertions.inputTokensSumMatches &&
    report.tokenReconciliation.assertions.providerAttemptsReconcile;

  const technicalGatesPass = report.remainingBlockers.length === 0;
  const lines = [
    'Newsletter token pipeline — pre-canary readiness',
    `Run ${report.runId} · ${report.runAt}`,
    `Fingerprint ${report.reportFingerprint}`,
    '',
    `Token reconcile: in=${tokens.inputTokens} out=${tokens.outputTokens ?? 'unknown'} events=${tokens.qualifyingEvents}`,
    `Event sources: cache=${sources.fromExtractCacheHits.qualifyingEvents} newLLM=${sources.fromNewLlmCalls.qualifyingEvents}`,
    `Reconciliation: ${reconcileOk ? 'PASS' : 'UNRECONCILED'}`,
    pd.label,
    `Runtime OCR (${report.productionRuntimeOcr.runtime}): ${runtimeStatus}`,
    report.productionWiring.description,
    `Technical gates: ${technicalGatesPass ? 'PASS' : 'FAIL'}`,
    'Canary readiness: plan prepared (not approved to activate)',
    `Ready for canary activation: NO${technicalGatesPass ? ' — explicit approval still required' : ''}`,
  ];

  if (report.remainingBlockers.length > 0) {
    lines.push('', 'Blockers:');
    for (const b of report.remainingBlockers) {
      lines.push(`- ${b}`);
    }
  }

  return lines.join('\n');
}

type LastSentRecord = {
  fingerprint: string;
  runId: string;
  sentAt: string;
  messagePreview: string;
};

function readLastSent(): LastSentRecord | null {
  try {
    if (!existsSync(LAST_SENT_PATH)) return null;
    return JSON.parse(readFileSync(LAST_SENT_PATH, 'utf8')) as LastSentRecord;
  } catch {
    return null;
  }
}

function writeLastSent(record: LastSentRecord): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(LAST_SENT_PATH, JSON.stringify(record, null, 2));
}

function acquireLock(runId: string): boolean {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(LOCK_PATH)) {
    try {
      const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as { runId: string; at: string };
      const ageMs = Date.now() - Date.parse(lock.at);
      if (ageMs < 120_000) return false;
    } catch {
      // stale lock
    }
  }
  writeFileSync(LOCK_PATH, JSON.stringify({ runId, at: new Date().toISOString() }));
  return true;
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    // ignore
  }
}

export type TelegramSendClassification =
  | 'sent'
  | 'skipped_duplicate_fingerprint'
  | 'skipped_lock_held'
  | 'skipped_not_configured'
  | 'failed';

export async function sendReadinessTelegramIfNew(
  report: ProductionReadinessReport,
): Promise<{
  classification: TelegramSendClassification;
  duplicateCause?: 'duplicate_worker' | 'retry' | 'manual_rerun' | 'same_fingerprint';
  priorRunId?: string;
}> {
  const message = formatTelegramReadinessSummary(report);
  const last = readLastSent();

  if (last?.fingerprint === report.reportFingerprint) {
    const ageMs = Date.now() - Date.parse(last.sentAt);
    let duplicateCause: 'duplicate_worker' | 'retry' | 'manual_rerun' | 'same_fingerprint' =
      'same_fingerprint';
    if (ageMs < 5000) duplicateCause = 'duplicate_worker';
    else if (ageMs < 60_000) duplicateCause = 'retry';
    else duplicateCause = 'manual_rerun';

    return {
      classification: 'skipped_duplicate_fingerprint',
      duplicateCause,
      priorRunId: last.runId,
    };
  }

  if (!acquireLock(report.runId)) {
    return { classification: 'skipped_lock_held', duplicateCause: 'duplicate_worker' };
  }

  try {
    const result = await sendTelegramMessage(message, { requireOutreachEnabled: false });
    if (result.skipped && result.reason === 'telegram_not_configured') {
      return { classification: 'skipped_not_configured' };
    }
    if (!result.sent) {
      return { classification: 'failed' };
    }

    writeLastSent({
      fingerprint: report.reportFingerprint,
      runId: report.runId,
      sentAt: new Date().toISOString(),
      messagePreview: message.slice(0, 200),
    });
    return { classification: 'sent' };
  } finally {
    releaseLock();
  }
}

export function finalizeReadinessReport(
  partial: Omit<
    ProductionReadinessReport,
    'remainingBlockers' | 'readyForCanaryActivation' | 'reportFingerprint' | 'canaryReadinessNote'
  > & {
    canaryReady: boolean;
    canaryBlockers: string[];
    flagsDisabled: boolean;
    acceptanceStatus?: 'PASSED' | 'FAILED' | 'BLOCKED';
  },
): ProductionReadinessReport {
  const precisionDisplay = partial.eventAudit.summary.precisionDisplay;
  const eventAuditForBlockers: EventAuditReport = {
    ...partial.eventAudit.summary,
    events: partial.eventAudit.events,
    precision: precisionDisplay.precision,
  };

  const remainingBlockers = computeReadinessBlockers({
    canaryReady: partial.canaryReady,
    canaryBlockers: partial.canaryBlockers,
    tokenReconciliation: partial.tokenReconciliation,
    eventAudit: eventAuditForBlockers,
    precisionDisplay,
    productionRuntimeOcr: partial.productionRuntimeOcr,
    flagsDisabled: partial.flagsDisabled,
    acceptanceStatus: partial.acceptanceStatus,
  });

  const reconciliationOk =
    partial.tokenReconciliation.assertions.inputTokensSumMatches &&
    partial.tokenReconciliation.assertions.providerAttemptsReconcile &&
    partial.tokenReconciliation.errors.length === 0;

  const reportFingerprint = computeReportFingerprint({
    sampleHash: partial.sampleHash,
    blockers: remainingBlockers,
    precisionStatus: precisionDisplay.status,
    runtimePassed: partial.productionRuntimeOcr.passed,
    wiringFlagsDisabled: partial.flagsDisabled,
    reconciliationOk,
  });

  const readyForCanaryActivation = remainingBlockers.length === 0;

  return {
    ...partial,
    remainingBlockers,
    readyForCanaryActivation,
    canaryReadinessNote: readyForCanaryActivation
      ? 'All gates pass — plan prepared; explicit approval still required before activation'
      : 'Blockers remain — not approved to activate',
    reportFingerprint,
  };
}
