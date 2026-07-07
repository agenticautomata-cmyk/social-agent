-- Benson Strategist v1 — stored AI briefings for creator growth analysis

CREATE TABLE IF NOT EXISTS strategist_briefings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prompt_version  TEXT NOT NULL,
  input_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_usage     JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost  NUMERIC(12, 6) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_strategist_briefings_creator_created
  ON strategist_briefings (creator_id, created_at DESC);
