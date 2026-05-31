-- Phase A: Sponsor pipeline — deal tracking from lead through won/lost

DO $$ BEGIN
  CREATE TYPE sponsor_pipeline_status AS ENUM (
    'lead',
    'contacted',
    'interested',
    'meeting_scheduled',
    'proposal_sent',
    'negotiating',
    'won',
    'lost'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sponsor_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_contact_id  UUID NOT NULL REFERENCES sponsor_contacts(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  estimated_value     NUMERIC(12, 2),
  actual_value        NUMERIC(12, 2),
  status              sponsor_pipeline_status NOT NULL DEFAULT 'lead',
  notes               TEXT,
  lead_source         TEXT,
  planner_list_name   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sponsor_opportunities_contact ON sponsor_opportunities (sponsor_contact_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_opportunities_status ON sponsor_opportunities (status);
CREATE INDEX IF NOT EXISTS idx_sponsor_opportunities_closed ON sponsor_opportunities (closed_at)
  WHERE closed_at IS NOT NULL;
