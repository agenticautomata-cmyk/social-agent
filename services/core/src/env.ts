import { z } from 'zod';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Auto-load .env from repo root if present (no-op if missing).
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../../.env'), quiet: true });
config({ path: resolve(here, '../../../.env'), quiet: true, override: true });

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

  // Instagram / Meta OAuth (Phase E — read-only analytics)
  IG_APP_ID: z.string().optional(),
  IG_APP_SECRET: z.string().optional(),
  IG_PAGE_ACCESS_TOKEN: z.string().optional(),
  IG_BUSINESS_ACCOUNT_ID: z.string().optional(),
  META_REDIRECT_URI: z.string().optional(),
  META_PAGE_ID: z.string().optional(),

  // TikTok (legacy publishing env — optional)
  TIKTOK_ACCESS_TOKEN: z.string().optional(),
  TIKTOK_OPEN_ID: z.string().optional(),
  // TikTok OAuth (Phase B — creator analytics connection)
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().optional(),
  /** Override authorize scopes (comma-separated). Sandbox Login Kit: user.info.basic */
  TIKTOK_OAUTH_SCOPES: z.string().optional(),
  /** Optional override: sandbox | production (otherwise inferred from client key prefix) */
  TIKTOK_CLIENT_MODE: z.string().optional(),

  /** IANA timezone for posting-time analytics (e.g. America/Chicago). */
  CREATOR_TIMEZONE: z.string().optional(),

  /** Display name Benson uses when addressing the creator (e.g. Kellie). */
  CREATOR_DISPLAY_NAME: z.string().optional(),
  CREATOR_GMAIL_SEND_AS: z.string().optional(),
  CREATOR_EMAIL_CONTACT: z.string().optional(),
  CREATOR_EMAIL_SPONSORS: z.string().optional(),
  CREATOR_EMAIL_MEDIA: z.string().optional(),
  CREATOR_EMAIL_COLLABS: z.string().optional(),
  CREATOR_EMAIL_BOOKING: z.string().optional(),

  /** OpenAI model for quick Ask Benson replies (briefings, simple questions). */
  BENSON_ASK_MODEL: z.string().default('gpt-4o-mini'),
  /** OpenAI model for analytics deep-dive / multi-turn metric conversations. */
  BENSON_ASK_DEEP_MODEL: z.string().default('gpt-4o'),
  /** OpenAI model used with the web_search tool (Responses API). */
  BENSON_WEB_SEARCH_MODEL: z.string().default('gpt-4o-mini'),
  /** TikTok pulse worker interval (sync + progress brief). Default 4 h. */
  BENSON_PULSE_INTERVAL_MS: z
    .string()
    .default(String(4 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Follower milestone watch — faster TikTok sync near 5K. Default 15 min. */
  BENSON_MILESTONE_WATCH_INTERVAL_MS: z
    .string()
    .default(String(15 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Opportunity refresh worker interval (source scrape + scoring). Default 6h. */
  BENSON_OPPORTUNITY_REFRESH_MS: z
    .string()
    .default(String(6 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Source health check worker interval. Default 24h. */
  BENSON_SOURCE_HEALTH_MS: z
    .string()
    .default(String(24 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Self-learning synthesis interval. Default 6h. */
  BENSON_LEARNING_INTERVAL_MS: z
    .string()
    .default(String(6 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Autonomous KC web discovery interval. Default 12h. */
  BENSON_DISCOVERY_INTERVAL_MS: z
    .string()
    .default(String(12 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),

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
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:benson@kckellie.com'),

  // Sponsor outreach (Phase B — Resend)
  RESEND_API_KEY: z.string().optional(),
  OUTREACH_FROM_EMAIL: z.string().optional(),
  OUTREACH_REPLY_TO: z.string().optional(),
  OUTREACH_ENABLE_LIVE_SEND: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  /** Preferred live send provider: gmail | resend. Default gmail when connected. */
  OUTREACH_SEND_PROVIDER: z.enum(['gmail', 'resend']).default('gmail'),
  BENSON_OUTREACH_DRAFTS_PER_DAY: z
    .string()
    .default('5')
    .transform((v) => parseInt(v, 10)),
  /** Run Benson auto-drafting even when DEMO_MODE=true. Default on. */
  BENSON_AUTO_DRAFT_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  /** Days after send before follow-up reminder + optional Benson draft. */
  OUTREACH_FOLLOW_UP_DAYS: z
    .string()
    .default('5')
    .transform((v) => parseInt(v, 10)),
  /** Use OpenAI for share intake extraction when key is present. Default on. */
  INTAKE_OPENAI_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),

  // Gmail OAuth (sponsor outreach)
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().optional(),
  GMAIL_INBOX_SYNC_INTERVAL_MS: z
    .string()
    .default('600000')
    .transform((v) => parseInt(v, 10)),
  GMAIL_DIGEST_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  GMAIL_DIGEST_INTERVAL_MS: z
    .string()
    .default('2700000')
    .transform((v) => parseInt(v, 10)),

  // Telegram backup notifications
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_OUTREACH_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
});

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;

export { featureFlags, type FeatureFlags } from './feature-flags.js';
