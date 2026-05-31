-- Phase A: Content planning — shortlist, boards, weekly plan

DO $$ BEGIN
  CREATE TYPE planner_item_status AS ENUM (
    'saved',
    'considering',
    'planned',
    'covered',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS planner_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id   UUID NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
  list_name         TEXT NOT NULL DEFAULT 'Saved For Later',
  notes             TEXT,
  priority          INTEGER NOT NULL DEFAULT 2,
  planned_date      DATE,
  content_angle     TEXT,
  status            planner_item_status NOT NULL DEFAULT 'saved',
  follow_up_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_items_status ON planner_items (status);
CREATE INDEX IF NOT EXISTS idx_planner_items_list ON planner_items (list_name);
CREATE INDEX IF NOT EXISTS idx_planner_items_planned_date ON planner_items (planned_date)
  WHERE planned_date IS NOT NULL;

-- Migrate existing editor home tracking rows (when editor table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'editor_opportunity_tracking'
  ) THEN
    INSERT INTO planner_items (
      content_item_id,
      list_name,
      notes,
      status,
      follow_up_at,
      created_at,
      updated_at
    )
    SELECT
      content_item_id,
      'Saved For Later',
      note,
      CASE
        WHEN covered THEN 'covered'::planner_item_status
        WHEN saved THEN 'saved'::planner_item_status
        ELSE 'saved'::planner_item_status
      END,
      follow_up_at,
      created_at,
      updated_at
    FROM editor_opportunity_tracking
    ON CONFLICT (content_item_id) DO NOTHING;
  END IF;
END $$;
