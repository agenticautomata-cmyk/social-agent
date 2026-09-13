/**
 * Change detection vs last-known-good — retain verified inventory on sudden failure.
 */

import type { AdaptiveExtractionStatus, ChangeDetectionResult } from './types.js';

export function detectExtractionChange(input: {
  status: AdaptiveExtractionStatus;
  contentFingerprint: string | null;
  priorFingerprint?: string | null;
  priorEventCount?: number | null;
  currentEventCount: number;
  priorPlatform?: string | null;
  currentPlatform?: string | null;
  acquisitionKind?: string | null;
  challengeProvider?: string | null;
  priorMethod?: string | null;
  currentMethod?: string | null;
}): ChangeDetectionResult {
  const signals: string[] = [];
  const lkg = input.priorFingerprint ?? null;

  if (input.challengeProvider) signals.push(`challenge:${input.challengeProvider}`);
  if (input.acquisitionKind === 'challenge' || input.acquisitionKind === 'access_control') {
    signals.push('access_control_or_challenge');
  }
  if (
    input.priorPlatform &&
    input.currentPlatform &&
    input.priorPlatform !== input.currentPlatform &&
    input.currentPlatform !== 'unknown'
  ) {
    signals.push(`platform_changed:${input.priorPlatform}->${input.currentPlatform}`);
  }
  if (
    input.priorMethod &&
    input.currentMethod &&
    input.priorMethod !== input.currentMethod
  ) {
    signals.push(`method_changed:${input.priorMethod}->${input.currentMethod}`);
  }
  if (
    typeof input.priorEventCount === 'number' &&
    input.priorEventCount > 0 &&
    input.currentEventCount === 0
  ) {
    signals.push('sudden_zero_vs_lkg');
  }
  if (lkg && input.contentFingerprint && lkg !== input.contentFingerprint) {
    signals.push('fingerprint_mismatch');
  }
  if (lkg && input.contentFingerprint && lkg === input.contentFingerprint) {
    signals.push('fingerprint_unchanged');
  }

  const retainPriorInventory =
    input.currentEventCount === 0 &&
    typeof input.priorEventCount === 'number' &&
    input.priorEventCount > 0 &&
    (input.status === 'blocked' ||
      input.status === 'failed' ||
      input.status === 'rate_limited' ||
      input.status === 'structure_changed' ||
      signals.includes('sudden_zero_vs_lkg'));

  let freshnessStatus: ChangeDetectionResult['freshnessStatus'] = 'unknown';
  if (input.status === 'healthy' || input.status === 'no_change') freshnessStatus = 'fresh';
  else if (input.status === 'blocked' || input.status === 'rate_limited') {
    freshnessStatus = 'blocked_reassess';
  } else if (retainPriorInventory) freshnessStatus = 'stale';

  return {
    changed: signals.some((s) => !s.includes('unchanged')),
    signals,
    lastKnownGoodFingerprint: lkg,
    retainPriorInventory,
    freshnessStatus,
  };
}
