import { z } from 'zod';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Auto-load .env from repo root if present (no-op if missing).
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../../.env'), quiet: true });
config({ path: resolve(here, '../../../.env'), quiet: true });

const Env = z.object({
  // Database
  DATABASE_URL: z
    .string()
    .default('postgres://social_agent:dev_password@localhost:5432/social_agent'),

  // Mode
  DEMO_MODE: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),

  // External APIs (all optional in demo mode)
  OPENAI_API_KEY: z.string().optional(),
  HEYGEN_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),

  // Instagram
  IG_PAGE_ACCESS_TOKEN: z.string().optional(),
  IG_BUSINESS_ACCOUNT_ID: z.string().optional(),

  // TikTok (legacy publishing env — optional)
  TIKTOK_ACCESS_TOKEN: z.string().optional(),
  TIKTOK_OPEN_ID: z.string().optional(),
  // TikTok OAuth (Phase B — creator analytics connection)
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().optional(),

  // Worker tuning
  WORKER_POLL_INTERVAL_MS: z
    .string()
    .default('2000')
    .transform((v) => parseInt(v, 10)),
  WORKER_BATCH_SIZE: z
    .string()
    .default('5')
    .transform((v) => parseInt(v, 10)),

  // Notifications
  SLACK_WEBHOOK_URL: z.string().optional(),

  // Sponsor outreach (Phase B — Resend)
  RESEND_API_KEY: z.string().optional(),
  OUTREACH_FROM_EMAIL: z.string().optional(),
  OUTREACH_REPLY_TO: z.string().optional(),
  OUTREACH_ENABLE_LIVE_SEND: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;

export { featureFlags, type FeatureFlags } from './feature-flags.js';
