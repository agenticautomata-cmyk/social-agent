-- Real-Time Ingestion Phase A — run logs + content freshness

DO $$ BEGIN
  CREATE TYPE source_ingestion_status AS ENUM ('running', 'success', 'partial', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS source_ingestion_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_name     TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  status          source_ingestion_status NOT NULL DEFAULT 'running',
  created_count   INTEGER NOT NULL DEFAULT 0,
  updated_count   INTEGER NOT NULL DEFAULT 0,
  skipped_count   INTEGER NOT NULL DEFAULT 0,
  error_count     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  raw_summary     JSONB NOT NULL DEFAULT '{}'::jsonb,
  dry_run         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_source_ingestion_runs_source_started
  ON source_ingestion_runs (source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_ingestion_runs_started
  ON source_ingestion_runs (started_at DESC);

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stale BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS freshness_bucket TEXT;

CREATE INDEX IF NOT EXISTS idx_content_items_freshness
  ON content_items (source_last_checked_at DESC NULLS LAST)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_stale
  ON content_items (stale)
  WHERE source_id IS NOT NULL;

-- Backfill first/last seen from discovered_at for ingested rows
UPDATE content_items
SET
  first_seen_at = COALESCE(first_seen_at, discovered_at, created_at),
  last_seen_at = COALESCE(last_seen_at, discovered_at, created_at),
  source_last_checked_at = COALESCE(source_last_checked_at, discovered_at, created_at)
WHERE source_id IS NOT NULL
  AND (first_seen_at IS NULL OR last_seen_at IS NULL);
