-- Persisted posting-time performance analytics (exact local-time slots)

CREATE TABLE IF NOT EXISTS creator_posting_analytics (
  creator_id    UUID NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  platform      platform NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timezone      TEXT NOT NULL,
  sample_size   INTEGER NOT NULL,
  median_views  INTEGER NOT NULL,
  analytics     JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (creator_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_creator_posting_analytics_computed
  ON creator_posting_analytics (computed_at DESC);
