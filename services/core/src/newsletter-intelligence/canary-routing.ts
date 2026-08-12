/**
 * Feature-flagged canary routing for token-efficient newsletter pipeline.
 * Default: disabled (0%). Old pipeline remains fallback.
 */

import { createHash } from 'node:crypto';
import { env } from '../env.js';

export type NewsletterPipelineMode = 'legacy' | 'token_efficient' | 'comparison';

export function isNewsletterTokenEfficientEnabled(): boolean {
  return env.NEWSLETTER_TOKEN_EFFICIENT_ENABLED === true;
}

export function newsletterTokenEfficientCanaryPercent(): number {
  return env.NEWSLETTER_TOKEN_EFFICIENT_CANARY_PERCENT;
}

export function isNewsletterComparisonMode(): boolean {
  return env.NEWSLETTER_TOKEN_EFFICIENT_COMPARISON_MODE === true;
}

/** Deterministic 0–99 bucket from Gmail message id. */
export function tokenEfficientCanaryBucket(gmailMessageId: string): number {
  const hex = createHash('sha256').update(gmailMessageId).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % 100;
}

export function resolveNewsletterPipelineMode(gmailMessageId: string): NewsletterPipelineMode {
  if (isNewsletterComparisonMode()) return 'comparison';
  if (!isNewsletterTokenEfficientEnabled()) return 'legacy';
  const pct = newsletterTokenEfficientCanaryPercent();
  if (pct <= 0) return 'legacy';
  if (pct >= 100) return 'token_efficient';
  return tokenEfficientCanaryBucket(gmailMessageId) < pct ? 'token_efficient' : 'legacy';
}

export function canaryReadinessCheck(): {
  ready: boolean;
  flags: {
    enabled: boolean;
    canaryPercent: number;
    comparisonMode: boolean;
  };
  blockers: string[];
} {
  const blockers: string[] = [];
  if (isNewsletterTokenEfficientEnabled()) {
    blockers.push('NEWSLETTER_TOKEN_EFFICIENT_ENABLED must remain false until explicit activation');
  }
  if (newsletterTokenEfficientCanaryPercent() > 0) {
    blockers.push('NEWSLETTER_TOKEN_EFFICIENT_CANARY_PERCENT must remain 0 until explicit activation');
  }
  return {
    ready: blockers.length === 0,
    flags: {
      enabled: isNewsletterTokenEfficientEnabled(),
      canaryPercent: newsletterTokenEfficientCanaryPercent(),
      comparisonMode: isNewsletterComparisonMode(),
    },
    blockers,
  };
}
