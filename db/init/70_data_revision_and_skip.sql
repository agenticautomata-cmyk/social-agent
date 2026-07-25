-- Global data revision counters + creator skip queue (distinct from dismiss/suppress).

CREATE TABLE IF NOT EXISTS benson_data_revisions (
  domain text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_event_type text,
  last_source text,
  last_success boolean NOT NULL DEFAULT true,
  last_record_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO benson_data_revisions (domain, revision)
VALUES
  ('analytics', 1),
  ('discoveries', 1),
  ('early_signals', 1),
  ('opportunities', 1),
  ('sponsors', 1),
  ('email', 1),
  ('worker_health', 1),
  ('recommendations', 1),
  ('home_briefing', 1)
ON CONFLICT (domain) DO NOTHING;

CREATE TABLE IF NOT EXISTS creator_skipped_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  occurrence_fingerprint text NOT NULL,
  skipped_at timestamptz NOT NULL DEFAULT now(),
  source_screen text NOT NULL DEFAULT 'unknown',
  snooze_until timestamptz,
  restored_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_skipped_active_fingerprint
  ON creator_skipped_records (content_item_id, occurrence_fingerprint)
  WHERE restored_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creator_skipped_active
  ON creator_skipped_records (skipped_at DESC)
  WHERE restored_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creator_skipped_snooze
  ON creator_skipped_records (snooze_until)
  WHERE restored_at IS NULL AND snooze_until IS NOT NULL;
