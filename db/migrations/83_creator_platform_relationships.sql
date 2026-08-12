-- Creator platform relationships + activities (ShopMy, LTK, etc.) — separate from brand partnerships.

CREATE TABLE IF NOT EXISTS creator_platform_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name text NOT NULL,
  domain text,
  status text NOT NULL DEFAULT 'unknown',
  account_email text,
  applied_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_platform_relationships_name
  ON creator_platform_relationships (lower(platform_name));

CREATE TABLE IF NOT EXISTS creator_platform_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_platform_relationship_id uuid NOT NULL REFERENCES creator_platform_relationships(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  subject text,
  snippet text,
  suggested_action text,
  follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_platform_activities_gmail_message
  ON creator_platform_activities (gmail_message_id);

CREATE INDEX IF NOT EXISTS idx_creator_platform_activities_relationship
  ON creator_platform_activities (creator_platform_relationship_id, created_at DESC);

-- Partnership activities: one row per Gmail message (idempotent reprocessing).
DROP INDEX IF EXISTS idx_creator_partnership_activities_gmail_partnership;

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_partnership_activities_gmail_message
  ON creator_partnership_activities (gmail_message_id)
  WHERE creator_partnership_id IS NOT NULL;

-- Seed ShopMy as first platform relationship (status updated by inbound mail).
INSERT INTO creator_platform_relationships (platform_name, domain, status)
SELECT 'ShopMy', 'shopmy.us', 'unknown'
WHERE NOT EXISTS (
  SELECT 1 FROM creator_platform_relationships WHERE lower(platform_name) = 'shopmy'
);
