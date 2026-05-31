-- Phase 2A: KC source ingestion (Reddit) — see db/migrations/06_kc_sources.sql

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM (
    'reddit', 'rss', 'ics', 'event_api', 'google_maps', 'manual', 'scrape'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sources (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  type               source_type NOT NULL,
  name               TEXT NOT NULL,
  config             JSONB NOT NULL DEFAULT '{}',
  active             BOOLEAN NOT NULL DEFAULT true,
  poll_interval_cron TEXT,
  last_scan_at       TIMESTAMPTZ,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID REFERENCES sources(id) ON DELETE SET NULL,
  campaign_id   UUID NOT NULL REFERENCES campaigns(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running',
  items_found   INT NOT NULL DEFAULT 0,
  items_created INT NOT NULL DEFAULT 0,
  items_skipped INT NOT NULL DEFAULT 0,
  error         TEXT,
  payload       JSONB
);

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id) ON DELETE SET NULL;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS source_external_id TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS relevance_score NUMERIC(4, 3);
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS urgency_score NUMERIC(4, 3);
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS event_starts_at TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS event_ends_at TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_lat NUMERIC;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_lng NUMERIC;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS raw_payload JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_source_external
  ON content_items (source_id, source_external_id)
  WHERE source_id IS NOT NULL AND source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_discovered_at ON content_items (discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_relevance ON content_items (relevance_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_content_source_id ON content_items (source_id);
CREATE INDEX IF NOT EXISTS idx_scan_runs_source ON scan_runs (source_id, started_at DESC);
