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
  /** Server-side Google Places API key for opportunity location resolution (Phase 1A). */
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  /** Opportunity location provider: mock (default) or google (live Places API). */
  LOCATION_PROVIDER: z.enum(['mock', 'google']).default('mock'),
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
  /**
   * Creator operating geography for local relevance research (e.g. "Kansas City metro").
   * Separate from CREATOR_TIMEZONE — timezone is for time calculations only.
   * When unset, partnership research uses national relevance and marks local as unresolved.
   */
  CREATOR_LOCAL_SCOPE: z.string().optional(),
  /** Local hour (0–23) for business-day follow-up reminders after email response windows. */
  CREATOR_BUSINESS_REMINDER_HOUR: z.string().optional(),
  /** Feature flag: Ask Benson URL intelligence sync path (provisional brief, source attach). */
  PARTNERSHIP_URL_INTELLIGENCE: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),

  /** ISO date when KC World Cup tournament matches ended (default: 2026-07-08). */
  KC_WORLD_CUP_TOURNAMENT_END: z.string().optional(),

  /** Display name Benson uses when addressing the creator (e.g. Kellie). */
  CREATOR_DISPLAY_NAME: z.string().optional(),
  CREATOR_GMAIL_SEND_AS: z.string().optional(),
  CREATOR_EMAIL_CONTACT: z.string().optional(),
  CREATOR_EMAIL_SPONSORS: z.string().optional(),
  CREATOR_EMAIL_MEDIA: z.string().optional(),
  CREATOR_EMAIL_COLLABS: z.string().optional(),
  CREATOR_EMAIL_BOOKING: z.string().optional(),
  CREATOR_EMAIL_DISCOVERIES: z.string().optional(),

  /** OpenAI model for quick Ask Benson replies (briefings, simple questions). */
  BENSON_ASK_MODEL: z.string().default('gpt-4o-mini'),
  /** Directory for Playwright Instagram session storage (storage-state.json). Never log contents. */
  SCOUT_INSTAGRAM_PROFILE_DIR: z.string().optional(),
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
  /** Autonomous KC web discovery interval. Default 24h (balanced cost). */
  BENSON_DISCOVERY_INTERVAL_MS: z
    .string()
    .default(String(24 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Opportunity refresh worker interval. Default 12h (balanced cost). */
  BENSON_OPPORTUNITY_REFRESH_MS: z
    .string()
    .default(String(12 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Source health check worker interval. Default 24h. */
  BENSON_SOURCE_HEALTH_MS: z
    .string()
    .default(String(24 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Expired-event hard-delete sweep. Default 24h. */
  BENSON_EXPIRED_SWEEP_MS: z
    .string()
    .default(String(24 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Self-learning synthesis interval. Default 24h (balanced cost). */
  BENSON_LEARNING_INTERVAL_MS: z
    .string()
    .default(String(24 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /** Program Library auto-enrichment worker interval. Default 6h. */
  PROGRAM_LIBRARY_ENRICHMENT_INTERVAL_MS: z
    .string()
    .default(String(6 * 60 * 60 * 1000))
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
    .default('2')
    .transform((v) => parseInt(v, 10)),
  /** Run Benson auto-drafting even when DEMO_MODE=true. Default on. */
  BENSON_AUTO_DRAFT_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  /**
   * The legacy inventory-flag drafting path (`computeTopSponsorCandidates` +
   * `contactFirstComposite >= 70`). It produced 167 pitches, 2 real sends and 0 replies,
   * and filled Kellie's queue with article headlines and rate-plan names. OFF by default;
   * the qualified hospitality pipeline is now the producer. Set to true only to
   * deliberately reopen the old firehose.
   */
  BENSON_LEGACY_OUTREACH_DRAFTING_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  /** Show "What Benson Has Learned" on Home — disable until suppression-sanitized snapshot exists. */
  BENSON_LEARNING_UI_ENABLED: z
    .string()
    .default('false')
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
  /** Max bytes for shared video via Share to Benson (default 500MB). */
  INTAKE_VIDEO_MAX_BYTES: z
    .string()
    .default(String(500 * 1024 * 1024))
    .transform((v) => parseInt(v, 10)),
  /** Max bytes for shared audio via Share to Benson (default 50MB). */
  INTAKE_AUDIO_MAX_BYTES: z
    .string()
    .default(String(50 * 1024 * 1024))
    .transform((v) => parseInt(v, 10)),
  /** OpenAI Whisper model for share intake transcription. */
  INTAKE_WHISPER_MODEL: z.string().default('whisper-1'),
  /** Poll interval for share intake media worker (ms). Default 30s (balanced cost). */
  INTAKE_MEDIA_WORKER_MS: z
    .string()
    .default('30000')
    .transform((v) => parseInt(v, 10)),

  // Gmail OAuth (sponsor outreach)
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().optional(),

  // Google Calendar OAuth (separate authorization from Gmail)
  GOOGLE_CALENDAR_CLIENT_ID: z.string().optional(),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().optional(),
  /** Google OAuth consent screen publish status — testing refresh tokens expire after 7 days. */
  GOOGLE_OAUTH_PUBLISHING_STATUS: z.enum(['testing', 'production']).default('testing'),
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
    .default(String(4 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  GMAIL_DIGEST_MAX_MESSAGES: z
    .string()
    .default('40')
    .transform((v) => parseInt(v, 10)),
  GMAIL_DIGEST_LOOKBACK_DAYS: z
    .string()
    .default('14')
    .transform((v) => parseInt(v, 10)),
  GMAIL_DIGEST_INCLUDE_PROMOTIONS: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  GMAIL_DISCOVERY_SYNC_MS: z
    .string()
    .default('900000')
    .transform((v) => parseInt(v, 10)),

  // Telegram backup notifications
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_OUTREACH_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),

  /** Protect Control Tower destructive actions in production. */
  BENSON_CONTROL_TOWER_KEY: z.string().optional(),

  /** Dedicated bearer secret for the local Benson voice-read API. Do not reuse the Control Tower key. */
  BENSON_VOICE_API_KEY: z.string().optional(),

  /** Master switches and caps for OpenAI spend (balanced defaults). */
  BENSON_DISCOVERY_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  BENSON_DISCOVERY_QUERY_COUNT: z
    .string()
    .default('2')
    .transform((v) => parseInt(v, 10)),
  /** First-class public Eventbrite KC discovery (HTML ItemList). Default on. */
  EVENTBRITE_KC_DISCOVERY_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  /** Cadence for Eventbrite KC public discovery. Default 24h. */
  EVENTBRITE_KC_DISCOVERY_INTERVAL_MS: z
    .string()
    .default(String(24 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),
  /**
   * When false (default), the Eventbrite KC worker runs dry-run only (no durable writes).
   * Set true only after dry-run acceptance to persist.
   */
  EVENTBRITE_KC_DISCOVERY_PERSIST: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  BENSON_SCORING_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  BENSON_SCORING_BATCH_LIMIT: z
    .string()
    .default('15')
    .transform((v) => parseInt(v, 10)),
  GMAIL_DIGEST_LLM_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  /** Use LLM digest only when a category batch has at least this many messages. */
  GMAIL_DIGEST_LLM_MIN_BATCH: z
    .string()
    .default('3')
    .transform((v) => parseInt(v, 10)),
  BENSON_WEB_SEARCH_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  BENSON_SOURCE_HEALTH_WEB_SEARCH_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  BENSON_ASK_DEEP_MODEL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  BENSON_LLM_DAILY_BUDGET_USD: z
    .string()
    .default('3')
    .transform((v) => parseFloat(v)),
  BENSON_CONCIERGE_WEB_SEARCH_DAILY: z
    .string()
    .default('5')
    .transform((v) => parseInt(v, 10)),
  EARLY_SIGNALS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  EARLY_SIGNALS_INTERVAL_MS: z
    .string()
    .default(String(6 * 60 * 60 * 1000))
    .transform((v) => parseInt(v, 10)),

  /** Internal Voicebox backend URL (localhost / private Docker network only). */
  VOICEBOX_BASE_URL: z.string().default('http://127.0.0.1:17493'),
  /** Generated Ask Benson audio storage directory. */
  VOICE_AUDIO_STORAGE_DIR: z.string().default('data/voice-audio'),
  /** Kokoro preset voice id for Benson Studio Voice. */
  BENSON_VOICE_PRESET_ID: z.string().default('am_echo'),
  /** Voice queue processor interval (ms). */
  VOICE_QUEUE_INTERVAL_MS: z
    .string()
    .default('2000')
    .transform((v) => parseInt(v, 10)),

  /** Token-efficient newsletter pipeline master switch (default off). */
  NEWSLETTER_TOKEN_EFFICIENT_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  /** Deterministic canary percent 0–100 by Gmail message id hash. */
  NEWSLETTER_TOKEN_EFFICIENT_CANARY_PERCENT: z
    .string()
    .default('0')
    .transform((v) => Math.max(0, Math.min(100, parseInt(v, 10) || 0))),
  /** Run both pipelines for diff metrics (never writes). */
  NEWSLETTER_TOKEN_EFFICIENT_COMPARISON_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  /** Max token-efficient canary messages per day when canary is active. */
  NEWSLETTER_TOKEN_EFFICIENT_CANARY_DAILY_MAX: z
    .string()
    .default('10')
    .transform((v) => Math.max(0, parseInt(v, 10) || 0)),
});

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;

export { featureFlags, type FeatureFlags } from './feature-flags.js';
