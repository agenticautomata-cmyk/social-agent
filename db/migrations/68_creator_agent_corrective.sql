-- Creator-agent corrective build: relevance gate, suppression, lifecycle, incidents.

DO $$ BEGIN
  CREATE TYPE creator_value_status AS ENUM (
    'hidden_raw_signal',
    'researching',
    'creator_candidate',
    'actionable',
    'top_pick',
    'rejected',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lifecycle_status AS ENUM (
    'upcoming',
    'active',
    'expiring_soon',
    'expired',
    'archived',
    'needs_date_verification'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE suppression_scope AS ENUM (
    'never_recommend',
    'never_pitch',
    'never_notify',
    'never_show_in_feed',
    'never_mention',
    'suppress_everywhere'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS creator_value_status creator_value_status NOT NULL DEFAULT 'hidden_raw_signal',
  ADD COLUMN IF NOT EXISTS lifecycle_status lifecycle_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS creator_relevance_explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS content_category text,
  ADD COLUMN IF NOT EXISTS classification_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS canonical_entity_id uuid,
  ADD COLUMN IF NOT EXISTS creator_next_action text,
  ADD COLUMN IF NOT EXISTS top_pick_validated_at timestamptz;

ALTER TABLE early_signals
  ADD COLUMN IF NOT EXISTS creator_value_status creator_value_status NOT NULL DEFAULT 'hidden_raw_signal',
  ADD COLUMN IF NOT EXISTS lifecycle_status lifecycle_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS creator_relevance_explanation jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS entity_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_entity_id uuid,
  canonical_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  domains text[] NOT NULL DEFAULT '{}',
  addresses text[] NOT NULL DEFAULT '{}',
  phone_numbers text[] NOT NULL DEFAULT '{}',
  social_handles text[] NOT NULL DEFAULT '{}',
  linked_record_ids uuid[] NOT NULL DEFAULT '{}',
  suppression_reason text NOT NULL,
  suppression_scope suppression_scope NOT NULL DEFAULT 'suppress_everywhere',
  permanent boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  restored_at timestamptz,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_entity_suppressions_scope ON entity_suppressions (suppression_scope)
  WHERE restored_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_suppressions_name ON entity_suppressions (lower(canonical_name))
  WHERE restored_at IS NULL;

CREATE TABLE IF NOT EXISTS creator_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  label text NOT NULL,
  category_pattern text NOT NULL,
  source_type_pattern text,
  default_action creator_value_status NOT NULL DEFAULT 'hidden_raw_signal',
  allow_when jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  reason_code text,
  comment text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_feedback_record ON creator_feedback_events (record_type, record_id, created_at DESC);

CREATE TABLE IF NOT EXISTS worker_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id text NOT NULL REFERENCES worker_heartbeats(worker_id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'detected',
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  recovering_at timestamptz,
  resolved_at timestamptz,
  last_error_code text,
  error_summary text,
  consecutive_failure_count integer NOT NULL DEFAULT 1,
  last_success_at timestamptz,
  last_failed_run_id uuid REFERENCES worker_job_runs(id) ON DELETE SET NULL,
  recovery_run_id uuid REFERENCES worker_job_runs(id) ON DELETE SET NULL,
  notification_sent_at timestamptz,
  recovery_notification_sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_incidents_active ON worker_incidents (worker_id, state)
  WHERE resolved_at IS NULL;

ALTER TABLE sponsor_contacts
  ADD COLUMN IF NOT EXISTS contact_verification_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS canonical_business_id uuid,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES sponsor_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'business';

ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS pitch_readiness_status text NOT NULL DEFAULT 'lead_only';

CREATE TABLE IF NOT EXISTS canonical_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  category text,
  website text,
  address text,
  local_relevance_score numeric(4,3),
  sponsor_fit_status text NOT NULL DEFAULT 'unknown',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_businesses_normalized ON canonical_businesses (normalized_name);

-- Default category suppression rules
INSERT INTO creator_category_rules (rule_key, label, category_pattern, source_type_pattern, default_action, allow_when)
VALUES
  ('liquor_renewal', 'Hide routine liquor license renewals', 'liquor|beer|wine|license', 'liquor|license', 'hidden_raw_signal',
   '["new_business","new_location","ownership_change","expansion","unusual_concept","suspension","revocation","closure"]'::jsonb),
  ('estate_sale', 'Hide routine estate and antique sales', 'estate|antique|auction|collectible|household', 'estate|auction|consignment', 'hidden_raw_signal',
   '["luxury_property","celebrity","rare_collection","major_bargain","designer_inventory","viral_interest"]'::jsonb),
  ('library_routine', 'Hide routine library programming', 'library|story hour|storytime|class|meeting', 'kc_library|library', 'hidden_raw_signal',
   '["celebrity","major_exhibit","unique_regional","high_value_free","broad_kc_interest"]'::jsonb),
  ('liquidation_national', 'Hide national liquidation without KC location', 'liquidation|going_out_of_business|store_closing', 'liquidation|closing', 'hidden_raw_signal',
   '["kc_location_confirmed","kc_impact_strong"]'::jsonb)
ON CONFLICT (rule_key) DO NOTHING;

-- Permanent Maj-R Thrift suppression
INSERT INTO entity_suppressions (
  canonical_name, aliases, suppression_reason, suppression_scope, permanent, created_by, metadata
)
SELECT
  'Maj-R Thrift',
  ARRAY['Maj R Thrift', 'MajR Thrift', 'Maj-R', 'Maj R', 'MajR'],
  'permanently_suppress',
  'suppress_everywhere',
  true,
  'system',
  '{"seed":"creator_agent_corrective","note":"User requested permanent suppress everywhere"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM entity_suppressions
  WHERE lower(canonical_name) = lower('Maj-R Thrift') AND restored_at IS NULL
);

-- Archive stale past events (keep audit data)
UPDATE content_items
SET
  lifecycle_status = 'expired',
  creator_value_status = CASE
    WHEN creator_value_status IN ('top_pick', 'actionable', 'creator_candidate') THEN 'archived'::creator_value_status
    ELSE creator_value_status
  END,
  stale = true,
  updated_at = now()
WHERE event_ends_at IS NOT NULL
  AND event_ends_at < now() - interval '24 hours'
  AND lifecycle_status NOT IN ('expired', 'archived');

UPDATE content_items
SET
  lifecycle_status = 'expired',
  creator_value_status = CASE
    WHEN creator_value_status IN ('top_pick', 'actionable', 'creator_candidate') THEN 'archived'::creator_value_status
    ELSE creator_value_status
  END,
  stale = true,
  updated_at = now()
WHERE event_starts_at IS NOT NULL
  AND event_starts_at < now() - interval '7 days'
  AND event_ends_at IS NULL
  AND lifecycle_status NOT IN ('expired', 'archived');

-- Hide obvious low-value categories from feeds by default
UPDATE content_items ci
SET creator_value_status = 'hidden_raw_signal',
    creator_relevance_explanation = COALESCE(ci.creator_relevance_explanation, '[]'::jsonb) ||
      '["category_rule:estate_or_antique_default_hidden"]'::jsonb
WHERE creator_value_status IN ('hidden_raw_signal', 'researching', 'creator_candidate', 'actionable', 'top_pick')
  AND (
    lower(coalesce(ci.topic, '')) ~ '(estate sale|estate auction|antique auction|household auction|collectible sale)'
    OR lower(coalesce(ci.metadata->'ingest'->>'category', ci.metadata->>'category', '')) ~ '(estate|antique|auction)'
  );

UPDATE content_items ci
SET creator_value_status = 'hidden_raw_signal',
    creator_relevance_explanation = COALESCE(ci.creator_relevance_explanation, '[]'::jsonb) ||
      '["category_rule:routine_library_hidden"]'::jsonb
WHERE creator_value_status IN ('hidden_raw_signal', 'researching', 'creator_candidate', 'actionable', 'top_pick')
  AND (
    lower(coalesce(ci.topic, '')) ~ '(story ?hour|storytime|library class|library meeting)'
    OR lower(coalesce(ci.metadata->'ingest'->>'category', '')) ~ 'library'
  );

-- Promote items with scores and verified dates to creator_candidate when still fresh
UPDATE content_items
SET creator_value_status = 'creator_candidate'
WHERE creator_value_status = 'hidden_raw_signal'
  AND lifecycle_status IN ('upcoming', 'active', 'expiring_soon')
  AND relevance_score IS NOT NULL
  AND (relevance_score::numeric >= 0.55 OR urgency_score::numeric >= 0.6)
  AND source_url IS NOT NULL
  AND topic IS NOT NULL
  AND length(trim(topic)) > 8;
