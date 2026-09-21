-- Openings Radar — first-class establishment/location discovery destination

CREATE TABLE IF NOT EXISTS opening_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  normalized_key text NOT NULL,
  parent_brand text,
  is_local_independent boolean,
  is_chain boolean,
  category text,
  description text,
  website_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_opening_businesses_normalized_key
  ON opening_businesses (normalized_key);

CREATE TABLE IF NOT EXISTS opening_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES opening_businesses(id) ON DELETE CASCADE,
  location_key text NOT NULL,
  street_address text,
  suite text,
  city text,
  state text,
  zip text,
  neighborhood text,
  latitude double precision,
  longitude double precision,
  status text NOT NULL DEFAULT 'announced',
  estimated_opening_label text,
  exact_opening_date date,
  grand_opening_date date,
  soft_opening_date date,
  planned_date date,
  revised_date date,
  actual_opening_date date,
  relocation_status text,
  expansion_status text,
  former_location text,
  former_tenant text,
  additional_locations_planned text,
  verification_level text NOT NULL DEFAULT 'unverified',
  creator_fit_score numeric(5,3),
  recommended_next_action text,
  source_title text,
  source_author text,
  source_url text,
  source_published_at timestamptz,
  source_fingerprint text,
  gmail_message_id text,
  social_post_url text,
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  opportunity_content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  calendar_item_id uuid REFERENCES creator_calendar_items(id) ON DELETE SET NULL,
  opportunity_decision text,
  event_decision text,
  dismissed_at timestamptz,
  dismiss_reason text,
  human_edited_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_discovered_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  last_researched_at timestamptz,
  stale_warning boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_opening_locations_business_location
  ON opening_locations (business_id, location_key);

CREATE INDEX IF NOT EXISTS idx_opening_locations_status
  ON opening_locations (status, dismissed_at, estimated_opening_label);

CREATE INDEX IF NOT EXISTS idx_opening_locations_source_fp
  ON opening_locations (source_fingerprint);

CREATE INDEX IF NOT EXISTS idx_opening_locations_gmail
  ON opening_locations (gmail_message_id);

CREATE TABLE IF NOT EXISTS opening_status_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES opening_locations(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  evidence text,
  source text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_opening_status_transitions_location
  ON opening_status_transitions (location_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS opening_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES opening_locations(id) ON DELETE CASCADE,
  field text,
  excerpt text NOT NULL,
  source_kind text NOT NULL DEFAULT 'editorial',
  source_url text,
  gmail_message_id text,
  confidence numeric(5,3),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_opening_evidence_location
  ON opening_evidence (location_id, extracted_at DESC);

CREATE TABLE IF NOT EXISTS opening_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES opening_locations(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_opening_alerts_fingerprint
  ON opening_alerts (fingerprint);

CREATE TABLE IF NOT EXISTS opening_ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_kind text NOT NULL DEFAULT 'editorial',
  source_fingerprint text,
  gmail_message_id text,
  source_url text,
  subject text,
  dry_run boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running',
  error text
);
