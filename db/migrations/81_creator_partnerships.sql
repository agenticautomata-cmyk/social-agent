-- Creator Partnership workflow: brand/product partnership research, fit scoring, and creator plays.

CREATE TABLE IF NOT EXISTS creator_partnerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  submitted_url text,
  submitted_text text,
  brand_name text,
  product_name text,
  retailer_name text,
  pipeline_status text NOT NULL DEFAULT 'discovered',
  monetization_paths text[] NOT NULL DEFAULT '{}'::text[],
  fit_score integer,
  fit_score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  creator_play jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_verification text[] NOT NULL DEFAULT '{}'::text[],
  follow_up_at timestamptz,
  calendar_reminder_at timestamptz,
  research_status research_job_status NOT NULL DEFAULT 'queued',
  research_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_partnerships_content_item
  ON creator_partnerships (content_item_id);

CREATE INDEX IF NOT EXISTS idx_creator_partnerships_status
  ON creator_partnerships (pipeline_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_partnerships_follow_up
  ON creator_partnerships (follow_up_at)
  WHERE follow_up_at IS NOT NULL;
