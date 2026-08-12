-- Creator partnership inbox activities (email → partnership matching v1).

CREATE TABLE IF NOT EXISTS creator_partnership_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_partnership_id uuid REFERENCES creator_partnerships(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  entity_type text NOT NULL DEFAULT 'unknown',
  entity_name text,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  sender_email text,
  sender_domain text,
  subject text,
  snippet text,
  match_confidence numeric(6, 4),
  matched_on text,
  suggested_status text,
  suggested_action text,
  suggested_follow_up_at timestamptz,
  requires_confirmation boolean NOT NULL DEFAULT true,
  confirmation_status text NOT NULL DEFAULT 'pending',
  confirmed_at timestamptz,
  rejected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_partnership_activities_gmail_partnership
  ON creator_partnership_activities (gmail_message_id, creator_partnership_id)
  WHERE creator_partnership_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_creator_partnership_activities_partnership
  ON creator_partnership_activities (creator_partnership_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_partnership_activities_pending
  ON creator_partnership_activities (creator_partnership_id, confirmation_status)
  WHERE confirmation_status = 'pending';

ALTER TABLE creator_partnerships
  ADD COLUMN IF NOT EXISTS fingerprints jsonb NOT NULL DEFAULT '{}'::jsonb;
