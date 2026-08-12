/**
 * Reconcile every OpenAI/provider HTTP attempt with a terminal status.
 */

export type ProviderAttemptStage = 'compact_extract' | 'compact_extract_retry' | 'ocr_image' | 'ocr_pdf' | 'research';

export type ProviderAttemptTerminalStatus =
  | 'completed_success'
  | 'completed_empty_valid'
  | 'malformed_response'
  | 'transient_failure'
  | 'quota_blocked'
  | 'canceled'
  | 'timeout'
  | 'controlled_retry'
  | 'fixture_only';

export type ProviderAttemptRecord = {
  requestLineageId: string;
  gmailMessageId: string;
  stage: ProviderAttemptStage;
  model: string;
  inputTokens: number;
  outputTokens: number;
  terminalStatus: ProviderAttemptTerminalStatus;
  detail?: string;
  at: string;
};

const TERMINAL_STATUSES: ProviderAttemptTerminalStatus[] = [
  'completed_success',
  'completed_empty_valid',
  'malformed_response',
  'transient_failure',
  'quota_blocked',
  'canceled',
  'timeout',
  'controlled_retry',
  'fixture_only',
];

export class ProviderAttemptLedger {
  readonly attempts: ProviderAttemptRecord[] = [];

  record(input: Omit<ProviderAttemptRecord, 'at'>): ProviderAttemptRecord {
    const row: ProviderAttemptRecord = { ...input, at: new Date().toISOString() };
    this.attempts.push(row);
    return row;
  }

  countsByTerminalStatus(): Record<ProviderAttemptTerminalStatus, number> {
    const out = Object.fromEntries(TERMINAL_STATUSES.map((s) => [s, 0])) as Record<
      ProviderAttemptTerminalStatus,
      number
    >;
    for (const a of this.attempts) {
      out[a.terminalStatus] += 1;
    }
    return out;
  }

  assertReconciles(expectedAttempts: number): void {
    const sum = Object.values(this.countsByTerminalStatus()).reduce((s, n) => s + n, 0);
    if (sum !== expectedAttempts) {
      throw new Error(
        `Provider attempt reconciliation failed: ${expectedAttempts} attempted vs ${sum} terminal records (${JSON.stringify(this.countsByTerminalStatus())})`,
      );
    }
  }

  merge(other: ProviderAttemptLedger): void {
    this.attempts.push(...other.attempts);
  }
}

let globalLedger: ProviderAttemptLedger | null = null;

export function beginProviderAttemptLedger(): ProviderAttemptLedger {
  globalLedger = new ProviderAttemptLedger();
  return globalLedger;
}

export function getProviderAttemptLedger(): ProviderAttemptLedger | null {
  return globalLedger;
}

export function endProviderAttemptLedger(): ProviderAttemptLedger | null {
  const ledger = globalLedger;
  globalLedger = null;
  return ledger;
}

export function recordProviderAttempt(input: Omit<ProviderAttemptRecord, 'at'>): ProviderAttemptRecord | null {
  return globalLedger?.record(input) ?? null;
}

export function explainUnreconciledAttempts(input: {
  callsAttempted: number;
  callsCompleted: number;
  blockedEmails: number;
  extractionFailures: number;
  ledger: ProviderAttemptLedger | null;
}): string {
  const gap = input.callsAttempted - (input.ledger?.attempts.length ?? 0);
  if (gap === 0 && input.ledger) {
    const counts = input.ledger.countsByTerminalStatus();
    const incomplete = input.callsAttempted - input.callsCompleted;
    return `All ${input.callsAttempted} attempts logged. Terminal breakdown: ${JSON.stringify(counts)}. ${incomplete} non-success completions include malformed_response, completed_empty_valid, controlled_retry origins, and OCR skips — not provider_blocked (${input.blockedEmails} emails).`;
  }
  return `${gap} provider calls were attempted but not logged — instrumentation gap.`;
}
