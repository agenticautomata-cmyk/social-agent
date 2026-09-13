/**
 * Strategy memory helpers — durable profile keyed by platform signature.
 * Never stores transient tokens/cookies or fabricated one-off selectors.
 */

import type { AdaptiveExtractionStatus, AdaptiveStrategyProfile, PlatformSignatureId } from './types.js';

export const STRATEGY_PROFILE_VERSION = 1;

export function emptyStrategyProfile(
  signature: PlatformSignatureId,
  profileKey: string,
): AdaptiveStrategyProfile {
  return {
    profileVersion: STRATEGY_PROFILE_VERSION,
    platformSignature: signature,
    profileKey,
    capabilitySequence: [
      'url_policy',
      'http_acquisition',
      'surface_discovery',
      'structured_data',
      'platform_recognition',
      'adapter_extract',
      'browser_fallback',
      'validation',
      'persist',
    ],
    endpointPattern: null,
    schemaMapping: null,
    pagination: null,
    renderWait: null,
    lastVerifiedAt: null,
    pageStructureFingerprint: null,
    successCount: 0,
    failureCount: 0,
    fixtureRef: null,
    confidence: 0.4,
    lastMethod: null,
    lastStatus: null,
  };
}

export function readStrategyProfile(config: Record<string, unknown> | null | undefined): AdaptiveStrategyProfile | null {
  const raw = config?.adaptiveStrategyProfile;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<AdaptiveStrategyProfile>;
  if (!p.platformSignature || !p.profileKey) return null;
  return {
    ...emptyStrategyProfile(p.platformSignature, p.profileKey),
    ...p,
    profileVersion: Number(p.profileVersion ?? STRATEGY_PROFILE_VERSION),
  };
}

export function updateStrategyProfile(input: {
  prior: AdaptiveStrategyProfile | null;
  signature: PlatformSignatureId;
  profileKey: string;
  method: string | null;
  status: AdaptiveExtractionStatus;
  pageStructureFingerprint: string | null;
  success: boolean;
  now?: Date;
}): AdaptiveStrategyProfile {
  const base =
    input.prior && input.prior.profileKey === input.profileKey
      ? input.prior
      : emptyStrategyProfile(input.signature, input.profileKey);
  const nowIso = (input.now ?? new Date()).toISOString();
  return {
    ...base,
    lastMethod: input.method,
    lastStatus: input.status,
    pageStructureFingerprint: input.pageStructureFingerprint ?? base.pageStructureFingerprint,
    successCount: base.successCount + (input.success ? 1 : 0),
    failureCount: base.failureCount + (input.success ? 0 : 1),
    lastVerifiedAt: input.success ? nowIso : base.lastVerifiedAt,
    confidence: Math.max(
      0.1,
      Math.min(
        0.99,
        (base.confidence + (input.success ? 0.08 : -0.05)) *
          (input.success && base.successCount >= 1 ? 1.02 : 1),
      ),
    ),
  };
}
