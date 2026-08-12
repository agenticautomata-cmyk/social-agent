import type { PrimaryEmailOutcome, PrimaryOutcomeCounts } from './outcomes.js';
import { EMPTY_OUTCOME_COUNTS } from './outcomes.js';

export type EmailTokenRecord = {
  gmailMessageId: string;
  subject: string;
  senderDomain: string;
  primaryOutcome: PrimaryEmailOutcome;
  prefilterReason: string | null;
  providerCallsAttempted: number;
  providerCallsCompleted: number;
  llmCalls: number;
  extractCacheHit: boolean;
  providerOcrCalls: number;
  localOcrRuns: number;
  localOcrCacheHits: number;
  localOcrFailures: number;
  researchCalls: number;
  retryTokens: number;
  inputTokens: number;
  outputTokens: number;
  ocrInputTokens: number;
  ocrOutputTokens: number;
  legacyEstimatedTokens: number;
  newEstimatedTokens: number;
  qualifyingEvents: number;
  eventsFromOcrOnly: number;
};

export type AcceptanceStatus = 'PASSED' | 'FAILED' | 'BLOCKED';

export type TokenReductionTotals = {
  totalEmails: number;
  primaryOutcomes: PrimaryOutcomeCounts;
  providerCallsAttempted: number;
  providerCallsCompleted: number;
  providerBlockedEmails: number;
  deterministicRejects: number;
  extractionSuccesses: number;
  extractionFailures: number;
  cacheHits: number;
  totalLlmCalls: number;
  averageLlmCallsPerEmail: number;
  inputTokens: number;
  outputTokens: number;
  ocrInputTokens: number;
  ocrOutputTokens: number;
  researchCalls: number;
  retryTokens: number;
  legacyEstimatedTokens: number;
  newEstimatedTokens: number;
  newMeasuredInputTokens: number;
  newMeasuredOutputTokens: number;
  newMeasuredTotalTokens: number;
  legacyMeasuredTokens: number | null;
  measuredReductionPercent: number | null;
  estimatedReductionPercent: number;
  /** Actual new tokens vs estimated legacy baseline (not dual-measured). */
  estimatedReductionPercentAgainstLegacyBaseline: number;
  qualifyingEventsRetained: number;
  acceptanceStatus: AcceptanceStatus;
  acceptanceReason: string | null;
  ocr: {
    emailsWithMedia: number;
    mediaInspected: number;
    mediaOcrAttempted: number;
    localOcrRuns: number;
    localOcrCacheHits: number;
    localOcrFailures: number;
    providerOcrCalls: number;
    providerOcrInputTokens: number;
    providerOcrOutputTokens: number;
    eventsFromOcrOnly: number;
  };
};

export class TokenUsageAccumulator {
  readonly records: EmailTokenRecord[] = [];

  add(record: EmailTokenRecord): void {
    this.records.push(record);
  }

  totals(options?: { providerQuotaBlockedRun?: boolean }): TokenReductionTotals {
    const primaryOutcomes = { ...EMPTY_OUTCOME_COUNTS };
    for (const r of this.records) {
      primaryOutcomes[r.primaryOutcome] += 1;
    }

    const providerCallsAttempted = this.records.reduce((s, r) => s + r.providerCallsAttempted, 0);
    const providerCallsCompleted = this.records.reduce((s, r) => s + r.providerCallsCompleted, 0);
    const providerBlockedEmails = primaryOutcomes.provider_blocked;
    const extractionSuccesses = primaryOutcomes.llm_extracted + primaryOutcomes.cache_hit;
    const extractionFailures = primaryOutcomes.extraction_failed;
    const cacheHits = primaryOutcomes.cache_hit;
    const inputTokens = this.records.reduce((s, r) => s + r.inputTokens, 0);
    const outputTokens = this.records.reduce((s, r) => s + r.outputTokens, 0);
    const ocrInputTokens = this.records.reduce((s, r) => s + r.ocrInputTokens, 0);
    const ocrOutputTokens = this.records.reduce((s, r) => s + r.ocrOutputTokens, 0);
    const retryTokens = this.records.reduce((s, r) => s + r.retryTokens, 0);
    const totalLlmCalls =
      this.records.reduce((s, r) => s + r.llmCalls + r.providerOcrCalls, 0);
    const legacyEstimatedTokens = this.records.reduce((s, r) => s + r.legacyEstimatedTokens, 0);
    const newEstimatedTokens = this.records.reduce((s, r) => s + r.newEstimatedTokens, 0);
    const newMeasuredInputTokens = inputTokens + ocrInputTokens;
    const newMeasuredOutputTokens = outputTokens + ocrOutputTokens;
    const newMeasuredTotalTokens = newMeasuredInputTokens + newMeasuredOutputTokens + retryTokens;

    const measuredReductionPercent = null;
    const estimatedReductionPercent =
      legacyEstimatedTokens > 0
        ? Math.round((1 - newEstimatedTokens / legacyEstimatedTokens) * 1000) / 10
        : 0;
    const estimatedReductionPercentAgainstLegacyBaseline =
      legacyEstimatedTokens > 0
        ? Math.round((1 - newMeasuredTotalTokens / legacyEstimatedTokens) * 1000) / 10
        : 0;

    const quotaBlockedRun =
      options?.providerQuotaBlockedRun ??
      (providerBlockedEmails > 0 && providerCallsCompleted === 0);

    let acceptanceStatus: AcceptanceStatus = 'PASSED';
    let acceptanceReason: string | null = null;

    if (quotaBlockedRun || (providerBlockedEmails > 0 && primaryOutcomes.llm_extracted === 0)) {
      acceptanceStatus = 'BLOCKED';
      acceptanceReason = 'provider_quota_exhausted';
    }

    return {
      totalEmails: this.records.length,
      primaryOutcomes,
      providerCallsAttempted,
      providerCallsCompleted,
      providerBlockedEmails,
      deterministicRejects: primaryOutcomes.rejected_pre_llm,
      extractionSuccesses,
      extractionFailures,
      cacheHits,
      totalLlmCalls,
      averageLlmCallsPerEmail:
        this.records.length > 0
          ? Math.round((totalLlmCalls / this.records.length) * 1000) / 1000
          : 0,
      inputTokens,
      outputTokens,
      ocrInputTokens,
      ocrOutputTokens,
      researchCalls: this.records.reduce((s, r) => s + r.researchCalls, 0),
      retryTokens,
      legacyEstimatedTokens,
      newEstimatedTokens,
      newMeasuredInputTokens,
      newMeasuredOutputTokens,
      newMeasuredTotalTokens,
      legacyMeasuredTokens: null,
      measuredReductionPercent,
      estimatedReductionPercent,
      estimatedReductionPercentAgainstLegacyBaseline,
      qualifyingEventsRetained: this.records.reduce((s, r) => s + r.qualifyingEvents, 0),
      acceptanceStatus,
      acceptanceReason,
      ocr: {
        emailsWithMedia: this.records.filter(
          (r) =>
            r.providerOcrCalls +
              r.localOcrRuns +
              r.localOcrCacheHits +
              r.localOcrFailures >
              0 || r.eventsFromOcrOnly > 0,
        ).length,
        mediaInspected: this.records.reduce(
          (s, r) => s + r.providerOcrCalls + r.localOcrRuns + r.localOcrCacheHits + r.localOcrFailures,
          0,
        ),
        mediaOcrAttempted: this.records.reduce(
          (s, r) => s + r.providerOcrCalls + r.localOcrRuns + r.localOcrFailures,
          0,
        ),
        localOcrRuns: this.records.reduce((s, r) => s + r.localOcrRuns, 0),
        localOcrCacheHits: this.records.reduce((s, r) => s + r.localOcrCacheHits, 0),
        localOcrFailures: this.records.reduce((s, r) => s + r.localOcrFailures, 0),
        providerOcrCalls: this.records.reduce((s, r) => s + r.providerOcrCalls, 0),
        providerOcrInputTokens: ocrInputTokens,
        providerOcrOutputTokens: ocrOutputTokens,
        eventsFromOcrOnly: this.records.reduce((s, r) => s + r.eventsFromOcrOnly, 0),
      },
    };
  }
}

const EVENT_SIGNAL =
  /\b(?:\d{1,2}[/-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}|\d{1,2}:\d{2}|kansas city|\bkc\b|concert|festival|opening|tickets?|rsvp|venue|free admission)\b/i;

/** Legacy pipeline: 1 text extract + up to 12 OCR calls per processable email. */
export function estimateLegacyPipelineTokens(input: {
  processable: boolean;
  bodyText: string;
  bodyHtml: string;
  imageCount: number;
}): number {
  if (!input.processable) return 0;
  const plain = input.bodyText.trim() || input.bodyHtml.replace(/<[^>]+>/g, ' ').trim();
  const extractInput = Math.ceil(800 + Math.min(plain.length, 12000) / 4 + 200);
  const extractOutput = 600;
  const ocrCalls = Math.min(Math.max(input.imageCount, 0), 12);
  const ocrTokens = ocrCalls * (1200 + 180);
  return extractInput + extractOutput + ocrTokens;
}

/** Token-efficient pipeline estimate: 1 compact extract + up to 2 selective OCR. */
export function estimateTokenEfficientPipelineTokens(input: {
  processable: boolean;
  reducedChars: number;
  selectiveOcrCandidates: number;
}): number {
  if (!input.processable) return 0;
  const extractInput = Math.ceil(500 + input.reducedChars / 4 + 150);
  const extractOutput = 400;
  const ocrCalls = Math.min(Math.max(input.selectiveOcrCandidates, 0), 2);
  const ocrTokens = ocrCalls * (1200 + 180);
  return extractInput + extractOutput + ocrTokens;
}

export function estimateTokensFromChars(chars: number, overhead = 400): number {
  return Math.ceil(chars / 4 + overhead);
}

export function ocrTextHasEventSignals(text: string): boolean {
  return EVENT_SIGNAL.test(text);
}
