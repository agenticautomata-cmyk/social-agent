-- Benson Action Center Phase A — due dates for planner, pipeline, outreach

ALTER TABLE planner_items
  ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_planner_items_due_date
  ON planner_items (due_date)
  WHERE due_date IS NOT NULL;

ALTER TABLE sponsor_opportunities
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sponsor_opportunities_due_date
  ON sponsor_opportunities (due_date)
  WHERE due_date IS NOT NULL;

ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS follow_up_due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outreach_emails_follow_up_due
  ON outreach_emails (follow_up_due_at)
  WHERE follow_up_due_at IS NOT NULL;
