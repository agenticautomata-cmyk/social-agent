/**
 * Proposed canary activation limits — prepared but not enabled.
 */

import { env } from '../env.js';
import {
  isNewsletterComparisonMode,
  isNewsletterTokenEfficientEnabled,
  newsletterTokenEfficientCanaryPercent,
  tokenEfficientCanaryBucket,
} from './canary-routing.js';

export const PROPOSED_CANARY_LIMITS = {
  scope: 'new_incoming_gmail_messages_only',
  canaryPercent: 10,
  dailyMaxMessages: 10,
  historicalBackfill: false,
  automaticGoogleCalendarExport: false,
  automaticConfirmation: false,
  reviewQueueRequired: true,
  envVarsToActivate: {
    NEWSLETTER_TOKEN_EFFICIENT_ENABLED: 'true',
    NEWSLETTER_TOKEN_EFFICIENT_CANARY_PERCENT: '10',
    NEWSLETTER_TOKEN_EFFICIENT_COMPARISON_MODE: 'false',
    NEWSLETTER_TOKEN_EFFICIENT_CANARY_DAILY_MAX: '10',
  },
} as const;

export type CanaryTrackingMetrics = {
  messagesRoutedLegacy: number;
  messagesRoutedTokenEfficient: number;
  messagesRoutedComparison: number;
  deterministicRejects: number;
  cacheHits: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  localOcrRuns: number;
  localOcrCacheHits: number;
  localOcrFailures: number;
  providerOcrCalls: number;
  providerFailures: number;
  acceptedEvents: number;
  falsePositives: number;
  falseNegativesFoundInAudit: number;
};

export function emptyCanaryTrackingMetrics(): CanaryTrackingMetrics {
  return {
    messagesRoutedLegacy: 0,
    messagesRoutedTokenEfficient: 0,
    messagesRoutedComparison: 0,
    deterministicRejects: 0,
    cacheHits: 0,
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    localOcrRuns: 0,
    localOcrCacheHits: 0,
    localOcrFailures: 0,
    providerOcrCalls: 0,
    providerFailures: 0,
    acceptedEvents: 0,
    falsePositives: 0,
    falseNegativesFoundInAudit: 0,
  };
}

export function canaryActivationPlanReport(): {
  activated: boolean;
  currentFlags: {
    enabled: boolean;
    canaryPercent: number;
    comparisonMode: boolean;
    dailyMax: number;
  };
  proposed: typeof PROPOSED_CANARY_LIMITS;
  sampleRoutingPreview: Array<{ gmailMessageId: string; bucket: number; wouldRouteTokenEfficient: boolean }>;
} {
  const sampleIds = ['19fb4f4f1b31dae6', '19fb4353a65bedeb', '19fad57b1cae54ee'];
  return {
    activated: false,
    currentFlags: {
      enabled: isNewsletterTokenEfficientEnabled(),
      canaryPercent: newsletterTokenEfficientCanaryPercent(),
      comparisonMode: isNewsletterComparisonMode(),
      dailyMax: env.NEWSLETTER_TOKEN_EFFICIENT_CANARY_DAILY_MAX,
    },
    proposed: PROPOSED_CANARY_LIMITS,
    sampleRoutingPreview: sampleIds.map((id) => ({
      gmailMessageId: id,
      bucket: tokenEfficientCanaryBucket(id),
      wouldRouteTokenEfficient:
        PROPOSED_CANARY_LIMITS.canaryPercent > 0 &&
        tokenEfficientCanaryBucket(id) < PROPOSED_CANARY_LIMITS.canaryPercent,
    })),
  };
}
