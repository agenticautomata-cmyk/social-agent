import { createHash } from 'node:crypto';
import type { ProviderAttemptRecord } from './provider-attempts.js';
import type { TokenEfficientEmailResult } from './pipeline-token-efficient.js';

export type PerCallTokenReconciliation = {
  requestLineageId: string;
  gmailMessageIdHash: string;
  gmailMessageId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  outputTokensKnown: boolean;
  totalTokens: number | null;
  extractedItemCount: number;
  acceptedEventCount: number;
  terminalStatus: string;
};

export type EventSourceBreakdown = {
  fromExtractCacheHits: { emails: number; qualifyingEvents: number };
  fromNewLlmCalls: { emails: number; qualifyingEvents: number };
  fromFixtures: { emails: number; qualifyingEvents: number };
  other: { emails: number; qualifyingEvents: number };
};

export type TokenReconciliationReport = {
  perCall: PerCallTokenReconciliation[];
  assertions: {
    inputTokensSumMatches: boolean;
    outputTokensSumMatches: boolean;
    totalTokensEqualsInputPlusOutput: boolean;
    acceptedEventsReconcile: boolean;
    providerAttemptsReconcile: boolean;
  };
  totals: {
    llmCalls: number;
    inputTokens: number;
    outputTokens: number | null;
    outputTokensKnown: boolean;
    totalTokens: number | null;
    qualifyingEvents: number;
  };
  eventSources: EventSourceBreakdown;
  errors: string[];
};

function hashGmailId(gmailMessageId: string): string {
  return createHash('sha256').update(gmailMessageId).digest('hex').slice(0, 16);
}

export function reconcileTokenUsage(input: {
  results: TokenEfficientEmailResult[];
  providerAttempts: ProviderAttemptRecord[];
  expectedProviderAttempts: number;
  includeFixtures?: boolean;
}): TokenReconciliationReport {
  const errors: string[] = [];
  const resultByGmail = new Map(input.results.map((r) => [r.gmailMessageId, r]));

  const compactAttempts = input.providerAttempts.filter((a) => a.stage.startsWith('compact_extract'));

  const perCall: PerCallTokenReconciliation[] = compactAttempts.map((attempt) => {
    const result = resultByGmail.get(attempt.gmailMessageId);
    const outputKnown = attempt.outputTokens != null && !Number.isNaN(attempt.outputTokens);
    const outputTokens = outputKnown ? attempt.outputTokens : null;
    return {
      requestLineageId: attempt.requestLineageId,
      gmailMessageIdHash: hashGmailId(attempt.gmailMessageId),
      gmailMessageId: attempt.gmailMessageId,
      model: attempt.model,
      inputTokens: attempt.inputTokens,
      cachedInputTokens: null,
      outputTokens,
      outputTokensKnown: outputKnown,
      totalTokens:
        outputKnown && attempt.inputTokens != null
          ? attempt.inputTokens + attempt.outputTokens
          : null,
      extractedItemCount: result?.items.length ?? 0,
      acceptedEventCount: result?.qualifyingEvents ?? 0,
      terminalStatus: attempt.terminalStatus,
    };
  });

  const inputSum = perCall.reduce((s, row) => s + row.inputTokens, 0);
  const outputSumKnown = perCall.every((row) => row.outputTokensKnown);
  const outputSum = outputSumKnown
    ? perCall.reduce((s, row) => s + (row.outputTokens ?? 0), 0)
    : null;

  const measuredInput = input.results.reduce((s, r) => s + r.tokenRecord.inputTokens, 0);
  const measuredOutput = input.results.reduce((s, r) => s + r.tokenRecord.outputTokens, 0);

  const inputTokensSumMatches = inputSum === measuredInput;
  if (!inputTokensSumMatches) {
    errors.push(`input token mismatch: per-call sum ${inputSum} vs batch ${measuredInput}`);
  }

  const outputTokensSumMatches = outputSumKnown ? outputSum === measuredOutput : false;
  if (!outputSumKnown) {
    errors.push('output token usage partially unknown at provider-attempt level');
  } else if (outputSum !== measuredOutput) {
    errors.push(`output token mismatch: per-call sum ${outputSum} vs batch ${measuredOutput}`);
  }

  const totalTokensEqualsInputPlusOutput =
    outputSumKnown && outputSum != null
      ? inputSum + outputSum === measuredInput + measuredOutput
      : false;
  if (outputSumKnown && !totalTokensEqualsInputPlusOutput) {
    errors.push(
      `total tokens mismatch: ${inputSum}+${outputSum} vs measured ${measuredInput}+${measuredOutput}`,
    );
  }

  const cacheEmails = input.results.filter((r) => r.primaryOutcome === 'cache_hit');
  const llmEmails = input.results.filter((r) => r.primaryOutcome === 'llm_extracted');
  const fixtureEmails = input.results.filter((r) => r.gmailMessageId.startsWith('fixture-'));
  const otherEmails = input.results.filter(
    (r) =>
      !fixtureEmails.includes(r) &&
      r.primaryOutcome !== 'cache_hit' &&
      r.primaryOutcome !== 'llm_extracted' &&
      r.qualifyingEvents > 0,
  );

  const eventSources: EventSourceBreakdown = {
    fromExtractCacheHits: {
      emails: cacheEmails.length,
      qualifyingEvents: cacheEmails.reduce((s, r) => s + r.qualifyingEvents, 0),
    },
    fromNewLlmCalls: {
      emails: llmEmails.length,
      qualifyingEvents: llmEmails.reduce((s, r) => s + r.qualifyingEvents, 0),
    },
    fromFixtures: input.includeFixtures
      ? {
          emails: fixtureEmails.length,
          qualifyingEvents: fixtureEmails.reduce((s, r) => s + r.qualifyingEvents, 0),
        }
      : { emails: 0, qualifyingEvents: 0 },
    other: {
      emails: otherEmails.length,
      qualifyingEvents: otherEmails.reduce((s, r) => s + r.qualifyingEvents, 0),
    },
  };

  const qualifyingEvents = input.results.reduce((s, r) => s + r.qualifyingEvents, 0);
  const sourceSum =
    eventSources.fromExtractCacheHits.qualifyingEvents +
    eventSources.fromNewLlmCalls.qualifyingEvents +
    eventSources.fromFixtures.qualifyingEvents +
    eventSources.other.qualifyingEvents;
  const acceptedEventsReconcile = sourceSum === qualifyingEvents;
  if (!acceptedEventsReconcile) {
    errors.push(`event source mismatch: breakdown ${sourceSum} vs total ${qualifyingEvents}`);
  }

  const providerAttemptsReconcile = compactAttempts.length === input.expectedProviderAttempts;
  if (!providerAttemptsReconcile) {
    errors.push(
      `provider attempt count mismatch: ledger ${compactAttempts.length} vs expected ${input.expectedProviderAttempts}`,
    );
  }

  return {
    perCall,
    assertions: {
      inputTokensSumMatches,
      outputTokensSumMatches,
      totalTokensEqualsInputPlusOutput,
      acceptedEventsReconcile,
      providerAttemptsReconcile,
    },
    totals: {
      llmCalls: compactAttempts.length,
      inputTokens: measuredInput,
      outputTokens: outputSumKnown ? measuredOutput : null,
      outputTokensKnown: outputSumKnown,
      totalTokens: outputSumKnown ? measuredInput + measuredOutput : null,
      qualifyingEvents,
    },
    eventSources,
    errors,
  };
}
