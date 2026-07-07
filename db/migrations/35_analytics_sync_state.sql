-- Phase E: analytics sync state + Facebook platform for creator connections

DO $$ BEGIN
  ALTER TYPE platform ADD VALUE IF NOT EXISTS 'facebook';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE analytics_connectors
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_successful_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followers BIGINT,
  ADD COLUMN IF NOT EXISTS post_count INTEGER,
  ADD COLUMN IF NOT EXISTS total_views BIGINT,
  ADD COLUMN IF NOT EXISTS total_engagement BIGINT,
  ADD COLUMN IF NOT EXISTS account_name TEXT;
