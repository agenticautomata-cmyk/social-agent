-- Phase B: TikTok OAuth readiness — creator platform connections (tokens encrypted at rest)

DO $$ BEGIN
  CREATE TYPE creator_platform_connection_status AS ENUM (
    'connected',
    'disconnected',
    'expired',
    'error',
    'credentials_missing'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS creator_platform_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_account_id      UUID NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  platform                platform NOT NULL,
  platform_user_id        TEXT,
  platform_username       TEXT,
  access_token_encrypted  TEXT,
  refresh_token_encrypted TEXT,
  scopes                  TEXT[] NOT NULL DEFAULT '{}'::text[],
  expires_at              TIMESTAMPTZ,
  connected_at            TIMESTAMPTZ,
  disconnected_at         TIMESTAMPTZ,
  status                  creator_platform_connection_status NOT NULL DEFAULT 'disconnected',
  last_error              TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_account_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_creator_platform_connections_status
  ON creator_platform_connections (platform, status);

CREATE INDEX IF NOT EXISTS idx_creator_platform_connections_account
  ON creator_platform_connections (creator_account_id);
