-- Pre-Alpha Readiness — tester feedback and bug reports

CREATE TABLE IF NOT EXISTS tester_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              TEXT NOT NULL CHECK (kind IN ('feedback', 'bug')),
  route             TEXT NOT NULL,
  page_title        TEXT,
  sentiment         TEXT CHECK (sentiment IS NULL OR sentiment IN ('up', 'down')),
  reason_code       TEXT,
  comment           TEXT,
  expected_behavior TEXT,
  user_email        TEXT,
  user_agent        TEXT,
  viewport          TEXT,
  entity_type       TEXT,
  entity_id         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tester_feedback_created ON tester_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tester_feedback_kind ON tester_feedback (kind);
CREATE INDEX IF NOT EXISTS idx_tester_feedback_route ON tester_feedback (route);
