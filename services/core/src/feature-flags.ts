import { z } from 'zod';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load repo-root .env so flags resolve consistently across api, workers, dashboard.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../../.env'), quiet: true });
config({ path: resolve(here, '../../../.env'), quiet: true });

const boolFlag = (defaultValue = false) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return defaultValue;
      return v === 'true' || v === '1';
    });

const FeatureFlagsSchema = z.object({
  disableVideoPipeline: boolFlag(false),
  enableOpportunitiesApi: boolFlag(false),
  enableBensonBranding: boolFlag(false),
  enableOpportunitiesUi: boolFlag(false),
  enableBensonTerminology: boolFlag(false),
  enableWorkerLabelAliases: boolFlag(false),
  enableBensonSeedNames: boolFlag(false),
  enableBensonDemoScript: boolFlag(false),
});

/** Parsed from env — all Benson flags default false. See FEATURE_FLAGS_SIMPLIFIED.md */
export const featureFlags = FeatureFlagsSchema.parse({
  disableVideoPipeline: process.env.DISABLE_VIDEO_PIPELINE,
  enableOpportunitiesApi: process.env.ENABLE_OPPORTUNITIES_API,
  enableBensonBranding: process.env.ENABLE_BENSON_BRANDING,
  enableOpportunitiesUi: process.env.ENABLE_OPPORTUNITIES_UI,
  enableBensonTerminology: process.env.ENABLE_BENSON_TERMINOLOGY,
  enableWorkerLabelAliases: process.env.ENABLE_WORKER_LABEL_ALIASES,
  enableBensonSeedNames: process.env.ENABLE_BENSON_SEED_NAMES,
  enableBensonDemoScript: process.env.ENABLE_BENSON_DEMO_SCRIPT,
});

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
