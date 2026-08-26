export const DISCOVERY_OCCURRENCE_REASONS = {
  dated_occurrences: 'dated_occurrences',
  duplicate_only: 'duplicate_only',
  informational_only: 'informational_only',
  no_dated_occurrence: 'no_dated_occurrence',
} as const;

export type DiscoveryOccurrenceOutcome = {
  processingStatus: 'processed' | 'duplicate' | 'skipped';
  processingError: string | null;
  reason: string;
};

/**
 * Processed means a new dated occurrence was persisted.
 * Duplicate-only and no-dated outcomes are explicit, never ambiguous processed+0.
 */
export function resolveDiscoveryOccurrenceOutcome(input: {
  skipReason?: string | null;
  datedOccurrencesCreated: number;
  datedOccurrenceDuplicates: number;
  extractedItemCount: number;
  datedCandidateCount?: number;
}): DiscoveryOccurrenceOutcome {
  if (input.skipReason) {
    return {
      processingStatus: 'skipped',
      processingError: input.skipReason,
      reason: input.skipReason,
    };
  }
  if (input.datedOccurrencesCreated > 0) {
    return {
      processingStatus: 'processed',
      processingError: null,
      reason: DISCOVERY_OCCURRENCE_REASONS.dated_occurrences,
    };
  }
  if (input.datedOccurrenceDuplicates > 0) {
    return {
      processingStatus: 'duplicate',
      processingError: DISCOVERY_OCCURRENCE_REASONS.duplicate_only,
      reason: DISCOVERY_OCCURRENCE_REASONS.duplicate_only,
    };
  }
  if ((input.datedCandidateCount ?? 0) > 0 || input.extractedItemCount > 0) {
    return {
      processingStatus: 'skipped',
      processingError: DISCOVERY_OCCURRENCE_REASONS.no_dated_occurrence,
      reason: DISCOVERY_OCCURRENCE_REASONS.no_dated_occurrence,
    };
  }
  return {
    processingStatus: 'skipped',
    processingError: DISCOVERY_OCCURRENCE_REASONS.informational_only,
    reason: DISCOVERY_OCCURRENCE_REASONS.informational_only,
  };
}
