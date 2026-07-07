-- Benson self-learning — synthesized insights from preferences, feedback, planner, and performance.

CREATE TABLE IF NOT EXISTS benson_learnings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_hash     TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  insights        JSONB NOT NULL DEFAULT '[]'::jsonb,
  signal_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_usage     JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost  NUMERIC(12, 6) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_benson_learnings_created
  ON benson_learnings (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_benson_learnings_source_hash
  ON benson_learnings (source_hash);
