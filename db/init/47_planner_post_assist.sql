ALTER TABLE planner_items ADD COLUMN IF NOT EXISTS draft_caption text;
ALTER TABLE planner_items ADD COLUMN IF NOT EXISTS posted_url text;
ALTER TABLE planner_items ADD COLUMN IF NOT EXISTS posted_at timestamptz;
