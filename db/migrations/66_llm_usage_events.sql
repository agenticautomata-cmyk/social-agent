-- Lightweight LLM usage tracking for paths without dedicated cost columns

CREATE TABLE IF NOT EXISTS llm_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  estimated_cost numeric(12, 6) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_created
  ON llm_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_events_source_created
  ON llm_usage_events (source, created_at DESC);
