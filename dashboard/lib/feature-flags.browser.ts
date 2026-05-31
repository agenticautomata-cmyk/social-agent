import { parseFeatureFlagsFromEnv } from '@social-agent/core/feature-flags.schema';

/**
 * Browser-safe feature flags for client components.
 * Values are mirrored from server env via next.config.mjs `env` (NEXT_PUBLIC_*).
 */
export const featureFlags = parseFeatureFlagsFromEnv({
  DISABLE_VIDEO_PIPELINE: process.env.NEXT_PUBLIC_DISABLE_VIDEO_PIPELINE,
  ENABLE_OPPORTUNITIES_API: process.env.NEXT_PUBLIC_ENABLE_OPPORTUNITIES_API,
  ENABLE_BENSON_BRANDING: process.env.NEXT_PUBLIC_ENABLE_BENSON_BRANDING,
  ENABLE_OPPORTUNITIES_UI: process.env.NEXT_PUBLIC_ENABLE_OPPORTUNITIES_UI,
  ENABLE_BENSON_TERMINOLOGY: process.env.NEXT_PUBLIC_ENABLE_BENSON_TERMINOLOGY,
  ENABLE_WORKER_LABEL_ALIASES: process.env.NEXT_PUBLIC_ENABLE_WORKER_LABEL_ALIASES,
  ENABLE_BENSON_SEED_NAMES: process.env.NEXT_PUBLIC_ENABLE_BENSON_SEED_NAMES,
  ENABLE_BENSON_DEMO_SCRIPT: process.env.NEXT_PUBLIC_ENABLE_BENSON_DEMO_SCRIPT,
  ENABLE_KC_SCANNER: process.env.NEXT_PUBLIC_ENABLE_KC_SCANNER,
});

export type { FeatureFlags } from '@social-agent/core/feature-flags.schema';
