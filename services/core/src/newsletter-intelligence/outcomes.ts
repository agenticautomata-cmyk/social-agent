/** Mutually exclusive primary outcome for each tested email. */
export type PrimaryEmailOutcome =
  | 'rejected_pre_llm'
  | 'cache_hit'
  | 'llm_extracted'
  | 'provider_blocked'
  | 'extraction_failed';

export type PrimaryOutcomeCounts = Record<PrimaryEmailOutcome, number>;

export const EMPTY_OUTCOME_COUNTS: PrimaryOutcomeCounts = {
  rejected_pre_llm: 0,
  cache_hit: 0,
  llm_extracted: 0,
  provider_blocked: 0,
  extraction_failed: 0,
};

export function assertOutcomeTotalsMatchSample(
  counts: PrimaryOutcomeCounts,
  sampleSize: number,
): void {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (total !== sampleSize) {
    throw new Error(
      `Primary outcome buckets are not mutually exclusive: sum=${total}, sampleSize=${sampleSize}, counts=${JSON.stringify(counts)}`,
    );
  }
}

export function explainPriorInvalidMetrics(): string {
  return [
    'Prior report counted overlapping secondary metrics as if they were exclusive:',
    '- zeroTokenRejects included classify skips, prefilter rejects, AND emails that never reached LLM for other reasons;',
    '- cacheHits counted extract/OCR cache separately while many of those emails were also in the non-skipped bucket;',
    '- provider quota returned empty extraction and was treated as zero-token success, producing a false 100% reduction.',
    'Fix: each email now has exactly one primaryOutcome; measured savings require successful provider calls.',
  ].join(' ');
}
