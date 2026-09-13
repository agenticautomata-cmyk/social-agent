/**
 * Optional billable vision escalation — DISABLED by default.
 * Provider-neutral interface; never invents facts. System must work OCR-only.
 */

import type { SlideOcrEvidence } from './types.js';

export type VisionEscalationRequest = {
  mediaHash: string;
  slideNumber: number;
  imageDataUrl: string;
  captionContext?: string | null;
  reason: 'uncertain_event_relevant' | 'low_confidence_ocr' | 'stylized_flyer';
};

export type VisionEscalationResult = {
  used: boolean;
  skippedReason: string | null;
  text: string;
  confidence: number;
  provider: string | null;
  estimatedCostUsd: number;
  evidence: SlideOcrEvidence | null;
};

export type VisionEscalationBudget = {
  enabled: boolean;
  remainingRunBudget: number;
  remainingMonthlyBudgetUsd: number;
};

const MONTHLY_SPEND_KEY = '__instagram_visual_vision_monthly_usd';

declare global {
  // eslint-disable-next-line no-var
  var __instagram_visual_vision_monthly_usd: number | undefined;
}

export function defaultVisionBudget(enabled: boolean): VisionEscalationBudget {
  const monthlyCap = Number(process.env.INSTAGRAM_VISION_MONTHLY_BUDGET_USD ?? 0);
  const spent = globalThis[MONTHLY_SPEND_KEY] ?? 0;
  return {
    enabled,
    remainingRunBudget: enabled ? Number(process.env.INSTAGRAM_VISION_MAX_PER_RUN ?? 2) : 0,
    remainingMonthlyBudgetUsd: Math.max(0, monthlyCap - spent),
  };
}

/**
 * Escalate only when enabled, budgeted, and OCR is insufficient.
 * Default implementation never calls a provider — returns skip.
 * Inject a provider adapter only under explicit operator authorization.
 */
export async function escalateToVision(input: {
  request: VisionEscalationRequest;
  budget: VisionEscalationBudget;
  cached?: boolean;
  provider?: (req: VisionEscalationRequest) => Promise<{
    text: string;
    confidence: number;
    provider: string;
    costUsd: number;
  }>;
}): Promise<VisionEscalationResult> {
  if (!input.budget.enabled) {
    return {
      used: false,
      skippedReason: 'billable_vision_disabled',
      text: '',
      confidence: 0,
      provider: null,
      estimatedCostUsd: 0,
      evidence: null,
    };
  }
  if (input.cached) {
    return {
      used: false,
      skippedReason: 'cached_ocr_available',
      text: '',
      confidence: 0,
      provider: null,
      estimatedCostUsd: 0,
      evidence: null,
    };
  }
  if (input.budget.remainingRunBudget <= 0) {
    return {
      used: false,
      skippedReason: 'per_run_budget_exhausted',
      text: '',
      confidence: 0,
      provider: null,
      estimatedCostUsd: 0,
      evidence: null,
    };
  }
  if (input.budget.remainingMonthlyBudgetUsd <= 0) {
    return {
      used: false,
      skippedReason: 'monthly_budget_exhausted',
      text: '',
      confidence: 0,
      provider: null,
      estimatedCostUsd: 0,
      evidence: null,
    };
  }
  if (!input.provider) {
    return {
      used: false,
      skippedReason: 'no_provider_configured',
      text: '',
      confidence: 0,
      provider: null,
      estimatedCostUsd: 0,
      evidence: null,
    };
  }

  const out = await input.provider(input.request);
  globalThis[MONTHLY_SPEND_KEY] = (globalThis[MONTHLY_SPEND_KEY] ?? 0) + out.costUsd;
  input.budget.remainingRunBudget -= 1;
  input.budget.remainingMonthlyBudgetUsd = Math.max(
    0,
    input.budget.remainingMonthlyBudgetUsd - out.costUsd,
  );

  const evidence: SlideOcrEvidence = {
    slideNumber: input.request.slideNumber,
    mediaHash: input.request.mediaHash,
    rawText: out.text,
    normalizedText: out.text.replace(/\s+/g, ' ').trim(),
    confidence: out.confidence,
    engine: out.provider,
    preprocessMethod: 'vision_escalation',
    fromCache: false,
    bboxes: [],
    timestamp: new Date().toISOString(),
    kind: 'image',
  };

  return {
    used: true,
    skippedReason: null,
    text: out.text,
    confidence: out.confidence,
    provider: out.provider,
    estimatedCostUsd: out.costUsd,
    evidence,
  };
}
