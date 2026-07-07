-- Autonomous KC web discovery runs (Benson scouts the internet on a schedule).

CREATE TABLE IF NOT EXISTS benson_discoveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_hash        TEXT NOT NULL,
  search_queries  TEXT[] NOT NULL DEFAULT '{}',
  summary         TEXT NOT NULL DEFAULT '',
  citations       JSONB NOT NULL DEFAULT '[]'::jsonb,
  items_found     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_count   INTEGER NOT NULL DEFAULT 0,
  updated_count   INTEGER NOT NULL DEFAULT 0,
  scored_count    INTEGER NOT NULL DEFAULT 0,
  token_usage     JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost  NUMERIC(12, 6) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_benson_discoveries_created
  ON benson_discoveries (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_benson_discoveries_run_hash
  ON benson_discoveries (run_hash);
