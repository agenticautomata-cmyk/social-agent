import { z } from 'zod';

const boolFlag = (defaultValue = false) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return defaultValue;
      return v === 'true' || v === '1';
    });

export const FeatureFlagsSchema = z.object({
  disableVideoPipeline: boolFlag(false),
  enableOpportunitiesApi: boolFlag(false),
  enableBensonBranding: boolFlag(false),
  enableOpportunitiesUi: boolFlag(false),
  enableBensonTerminology: boolFlag(false),
  enableWorkerLabelAliases: boolFlag(false),
  enableBensonSeedNames: boolFlag(false),
  enableBensonDemoScript: boolFlag(false),
  enableKcScanner: boolFlag(false),
  /** Native TikTok schedule/publish — deferred until Post Assist proves value. */
  enableTiktokPublish: boolFlag(false),
});

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

/** Parse flags from a plain env map — safe for browser bundles (no Node imports). */
export function parseFeatureFlagsFromEnv(
  env: Record<string, string | undefined>,
): FeatureFlags {
  return FeatureFlagsSchema.parse({
    disableVideoPipeline: env.DISABLE_VIDEO_PIPELINE,
    enableOpportunitiesApi: env.ENABLE_OPPORTUNITIES_API,
    enableBensonBranding: env.ENABLE_BENSON_BRANDING,
    enableOpportunitiesUi: env.ENABLE_OPPORTUNITIES_UI,
    enableBensonTerminology: env.ENABLE_BENSON_TERMINOLOGY,
    enableWorkerLabelAliases: env.ENABLE_WORKER_LABEL_ALIASES,
    enableBensonSeedNames: env.ENABLE_BENSON_SEED_NAMES,
    enableBensonDemoScript: env.ENABLE_BENSON_DEMO_SCRIPT,
    enableKcScanner: env.ENABLE_KC_SCANNER,
    enableTiktokPublish: env.ENABLE_TIKTOK_PUBLISH,
  });
}
