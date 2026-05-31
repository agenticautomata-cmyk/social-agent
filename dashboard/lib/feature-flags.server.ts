import 'server-only';

import { parseFeatureFlagsFromEnv } from '@social-agent/core/feature-flags.schema';

/** Server-side flags — Next.js loads .env into process.env; no Node-only core/feature-flags import. */
export const featureFlags = parseFeatureFlagsFromEnv(process.env);

export type { FeatureFlags } from '@social-agent/core/feature-flags.schema';
