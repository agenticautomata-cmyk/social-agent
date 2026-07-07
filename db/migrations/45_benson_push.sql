-- Benson web push — subscriptions and per-topic preferences.

CREATE TABLE IF NOT EXISTS benson_push_settings (
  id              TEXT PRIMARY KEY DEFAULT 'global',
  master_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  topics          JSONB NOT NULL DEFAULT '{
    "tiktok_pulse": true,
    "local_discovery": true,
    "action_reminders": true,
    "top_picks": false,
    "share_intake": true
  }'::jsonb,
  last_sent_at    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO benson_push_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS benson_push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benson_push_subscriptions_updated
  ON benson_push_subscriptions (updated_at DESC);
