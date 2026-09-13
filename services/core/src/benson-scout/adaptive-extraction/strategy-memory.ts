/**
 * Strategy memory helpers — durable profile keyed by platform signature.
 * Never stores tokens/cookies/CAPTCHA artifacts/proxy identities/fabricated paths.
 */

import type {
  AdaptiveExtractionStatus,
  AdaptiveStrategyProfile,
  PlatformSignatureId,
  StrategyStep,
} from './types.js';

export const STRATEGY_PROFILE_VERSION = 2;

const DEFAULT_SEQUENCE: StrategyStep[] = [
  'url_policy',
  'http_acquisition',
  'surface_discovery',
  'structured_data',
  'platform_recognition',
  'strategy_plan',
  'alternate_surface_fetch',
  'adapter_extract',
  'browser_fallback',
  'generic_semantic',
  'image_ocr',
  'validation',
  'change_detection',
  'persist',
];

export function emptyStrategyProfile(
  signature: PlatformSignatureId,
  profileKey: string,
): AdaptiveStrategyProfile {
  return {
    profileVersion: STRATEGY_PROFILE_VERSION,
    platformSignature: signature,
    profileKey,
    capabilitySequence: [...DEFAULT_SEQUENCE],
    surfaceType: null,
    discoveryPath: null,
    endpointPattern: null,
    schemaMapping: null,
    pagination: null,
    renderWait: null,
    browserWait: null,
    requiredFields: ['title', 'startDate', 'sourceUrl'],
    detailEnrichment: null,
    lastVerifiedAt: null,
    pageStructureFingerprint: null,
    expectedCountRange: null,
    consecutiveFailures: 0,
    successCount: 0,
    failureCount: 0,
    fixtureRef: null,
    confidence: 0.4,
    lastMethod: null,
    lastStatus: null,
    evidenceQuality: 0.3,
    domainOverrideReason: null,
    trustedPromotion: false,
  };
}

export function readStrategyProfile(
  config: Record<string, unknown> | null | undefined,
): AdaptiveStrategyProfile | null {
  const raw = config?.adaptiveStrategyProfile;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<AdaptiveStrategyProfile>;
  if (!p.platformSignature || !p.profileKey) return null;
  return {
    ...emptyStrategyProfile(p.platformSignature, p.profileKey),
    ...p,
    profileVersion: Number(p.profileVersion ?? STRATEGY_PROFILE_VERSION),
    requiredFields: Array.isArray(p.requiredFields)
      ? (p.requiredFields as string[])
      : ['title', 'startDate', 'sourceUrl'],
    trustedPromotion: Boolean(p.trustedPromotion),
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
  surfaceType?: string | null;
  discoveryPath?: string | null;
  endpointPattern?: string | null;
  evidenceQuality?: number;
  occurrenceCount?: number;
  now?: Date;
}): AdaptiveStrategyProfile {
  const base =
    input.prior && input.prior.profileKey === input.profileKey
      ? input.prior
      : emptyStrategyProfile(input.signature, input.profileKey);
  const nowIso = (input.now ?? new Date()).toISOString();
  const successCount = base.successCount + (input.success ? 1 : 0);
  const failureCount = base.failureCount + (input.success ? 0 : 1);
  const consecutiveFailures = input.success ? 0 : base.consecutiveFailures + 1;

  // Require multiple validated successes before trusted promotion.
  const trustedPromotion =
    successCount >= 2 &&
    consecutiveFailures === 0 &&
    (input.evidenceQuality ?? base.evidenceQuality) >= 0.55;

  const expectedCountRange =
    input.success && typeof input.occurrenceCount === 'number' && input.occurrenceCount > 0
      ? {
          min: Math.max(1, Math.floor(input.occurrenceCount * 0.4)),
          max: Math.ceil(input.occurrenceCount * 2.5) + 5,
        }
      : base.expectedCountRange;

  return {
    ...base,
    lastMethod: input.method,
    lastStatus: input.status,
    surfaceType: input.surfaceType ?? base.surfaceType,
    discoveryPath: input.discoveryPath ?? base.discoveryPath,
    endpointPattern: input.endpointPattern ?? base.endpointPattern,
    pageStructureFingerprint: input.pageStructureFingerprint ?? base.pageStructureFingerprint,
    expectedCountRange,
    successCount,
    failureCount,
    consecutiveFailures,
    lastVerifiedAt: input.success ? nowIso : base.lastVerifiedAt,
    evidenceQuality: Math.max(
      0.05,
      Math.min(0.99, input.evidenceQuality ?? base.evidenceQuality + (input.success ? 0.05 : -0.04)),
    ),
    trustedPromotion,
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
