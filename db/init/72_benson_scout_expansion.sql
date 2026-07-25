-- Benson Scout expansion — extends source_watchers + Scout intelligence tables

ALTER TABLE source_watchers
  ADD COLUMN IF NOT EXISTS submitted_url text,
  ADD COLUMN IF NOT EXISTS canonical_source_url text,
  ADD COLUMN IF NOT EXISTS publisher_url text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS jurisdiction text DEFAULT 'Kansas City, MO',
  ADD COLUMN IF NOT EXISTS monitoring_mode text NOT NULL DEFAULT 'WATCH_PAGE',
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS adaptive_frequency boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_reliability numeric(4,3),
  ADD COLUMN IF NOT EXISTS creator_lead_potential numeric(4,3),
  ADD COLUMN IF NOT EXISTS signal_to_noise_score numeric(4,3),
  ADD COLUMN IF NOT EXISTS last_attempted_check timestamptz,
  ADD COLUMN IF NOT EXISTS last_new_item_detected timestamptz,
  ADD COLUMN IF NOT EXISTS last_material_change timestamptz,
  ADD COLUMN IF NOT EXISTS latest_content_date timestamptz,
  ADD COLUMN IF NOT EXISTS session_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS authentication_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS robots_review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selector_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by text DEFAULT 'creator';

CREATE INDEX IF NOT EXISTS idx_source_watchers_monitoring
  ON source_watchers (monitoring_mode, enabled, paused);

CREATE TABLE IF NOT EXISTS scout_source_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id uuid NOT NULL REFERENCES source_watchers(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'scheduled',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  fetch_methods_attempted text[] NOT NULL DEFAULT '{}'::text[],
  final_fetch_method text,
  response_status integer,
  item_count integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  hidden_count integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  failure_category text,
  sanitized_failure text,
  cpu_time_ms integer,
  memory_peak_mb integer,
  bytes_downloaded bigint NOT NULL DEFAULT 0,
  trace_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scout_source_runs_watcher
  ON scout_source_runs (watcher_id, started_at DESC);

CREATE TABLE IF NOT EXISTS scout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id uuid NOT NULL REFERENCES source_watchers(id) ON DELETE CASCADE,
  external_item_id text,
  item_url text NOT NULL,
  publisher text,
  published_at timestamptz,
  modified_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  caption_text text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_type text NOT NULL DEFAULT 'unknown',
  lifecycle_status text NOT NULL DEFAULT 'active',
  creator_value_status text NOT NULL DEFAULT 'pending',
  content_hash text NOT NULL,
  occurrence_fingerprint text NOT NULL,
  linked_content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  linked_early_signal_id uuid REFERENCES early_signals(id) ON DELETE SET NULL,
  linked_entity_id uuid,
  verification_status text NOT NULL DEFAULT 'unverified',
  relevance_explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_items_fingerprint
  ON scout_items (watcher_id, occurrence_fingerprint);

CREATE INDEX IF NOT EXISTS idx_scout_items_watcher_detected
  ON scout_items (watcher_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS scout_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_item_id uuid NOT NULL REFERENCES scout_items(id) ON DELETE CASCADE,
  media_type text NOT NULL,
  original_url text,
  storage_path text,
  mime_type text,
  width integer,
  height integer,
  duration_seconds numeric(10,3),
  content_hash text,
  ocr_status text NOT NULL DEFAULT 'pending',
  ocr_confidence numeric(5,3),
  extracted_text text,
  ocr_engine text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_scout_media_item ON scout_media_assets (scout_item_id);

CREATE TABLE IF NOT EXISTS scout_extracted_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_item_id uuid REFERENCES scout_items(id) ON DELETE CASCADE,
  document_url text,
  file_type text,
  file_hash text,
  page_count integer,
  extraction_status text NOT NULL DEFAULT 'queued',
  structured_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  table_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  extraction_engine text,
  extraction_version text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS scout_social_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id uuid NOT NULL REFERENCES source_watchers(id) ON DELETE CASCADE,
  platform text NOT NULL,
  profile_reference text NOT NULL,
  session_status text NOT NULL DEFAULT 'unknown',
  last_validated_at timestamptz,
  expires_at timestamptz,
  needs_user_login boolean NOT NULL DEFAULT false,
  sanitized_failure text,
  storage_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scout_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_item_id uuid REFERENCES scout_items(id) ON DELETE CASCADE,
  early_signal_id uuid REFERENCES early_signals(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  source_url text,
  source_name text,
  page_or_image_ref text,
  quoted_claim text NOT NULL,
  field_supported text,
  confidence numeric(5,3),
  verification_status text NOT NULL DEFAULT 'unverified',
  detected_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scout_evidence_item ON scout_evidence (scout_item_id, detected_at DESC);

INSERT INTO benson_data_revisions (domain, revision)
VALUES ('scout', 1)
ON CONFLICT (domain) DO NOTHING;

-- Rollback (manual):
-- DROP TABLE scout_evidence, scout_social_sessions, scout_extracted_documents, scout_media_assets, scout_items, scout_source_runs;
-- ALTER TABLE source_watchers DROP COLUMN IF EXISTS monitoring_mode; ... (see full rollback in docs)
