import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { parseFeatureFlagsFromEnv, type FeatureFlags } from './feature-flags.schema.js';

// Load repo-root .env so flags resolve consistently across api, workers, dashboard.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../../.env'), quiet: true });
config({ path: resolve(here, '../../../.env'), quiet: true });

/** Parsed from env — all Benson flags default false. See FEATURE_FLAGS_SIMPLIFIED.md */
export const featureFlags: FeatureFlags = parseFeatureFlagsFromEnv(process.env);

export type { FeatureFlags } from './feature-flags.schema.js';
