-- Phase 22: creator interest + research jobs for assisted discovery actions.

DO $$ BEGIN
  CREATE TYPE research_job_status AS ENUM (
    'queued',
    'researching',
    'needs_verification',
    'complete',
    'failed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS creator_interest_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  interest_level text NOT NULL DEFAULT 'interested',
  source_screen text NOT NULL DEFAULT 'unknown',
  requested_assistance text[] NOT NULL DEFAULT '{}',
  enrichment_status research_job_status NOT NULL DEFAULT 'queued',
  research_job_id uuid,
  next_action text,
  planned_date timestamptz,
  dismissed_at timestamptz,
  outcome text,
  assistance_package jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_interest_active_item
  ON creator_interest_records (content_item_id)
  WHERE dismissed_at IS NULL AND interest_level NOT IN ('never_show', 'not_interested');

CREATE INDEX IF NOT EXISTS idx_creator_interest_status
  ON creator_interest_records (enrichment_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS creator_research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  interest_record_id uuid REFERENCES creator_interest_records(id) ON DELETE SET NULL,
  status research_job_status NOT NULL DEFAULT 'queued',
  enrichment jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_research_jobs_item
  ON creator_research_jobs (content_item_id, created_at DESC);
