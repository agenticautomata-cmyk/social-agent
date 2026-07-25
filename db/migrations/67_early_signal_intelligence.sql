-- Early Signal Intelligence — raw signals vs verified opportunities

CREATE TABLE IF NOT EXISTS source_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_url text NOT NULL,
  source_category text NOT NULL DEFAULT 'general',
  adapter_type text NOT NULL DEFAULT 'html_watch',
  check_frequency_ms integer NOT NULL DEFAULT 21600000,
  last_successful_check timestamptz,
  last_changed_at timestamptz,
  last_failure_at timestamptz,
  last_failure_message text,
  enabled boolean NOT NULL DEFAULT true,
  consecutive_failure_count integer NOT NULL DEFAULT 0,
  health_status text NOT NULL DEFAULT 'unknown',
  linked_source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_watchers_enabled ON source_watchers (enabled, health_status);
CREATE INDEX IF NOT EXISTS idx_source_watchers_adapter ON source_watchers (adapter_type, enabled);

CREATE TABLE IF NOT EXISTS source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id uuid NOT NULL REFERENCES source_watchers(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  extracted_content text,
  response_status integer,
  change_summary text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_watcher_fetched
  ON source_snapshots (watcher_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS early_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  source_url text,
  source_name text,
  source_category text,
  business_name text,
  address text,
  city text DEFAULT 'Kansas City',
  region_state text DEFAULT 'MO',
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  event_date timestamptz,
  raw_text text,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  confidence_level text NOT NULL DEFAULT 'low',
  confidence_score numeric(5, 2) NOT NULL DEFAULT 0,
  confidence_explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  urgency_level text NOT NULL DEFAULT 'weak_signal',
  urgency_score numeric(5, 2) NOT NULL DEFAULT 0,
  urgency_explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_status text NOT NULL DEFAULT 'unverified',
  signal_state text NOT NULL DEFAULT 'active',
  linked_opportunity_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  watcher_id uuid REFERENCES source_watchers(id) ON DELETE SET NULL,
  cluster_key text,
  content_recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dismissed_at timestamptz,
  snoozed_until timestamptz,
  alert_sent_at timestamptz,
  alert_content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_early_signals_state ON early_signals (signal_state, urgency_level, first_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_early_signals_cluster ON early_signals (cluster_key) WHERE cluster_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_early_signals_hash ON early_signals (content_hash);
CREATE INDEX IF NOT EXISTS idx_early_signals_verification ON early_signals (verification_status, confidence_level);

CREATE TABLE IF NOT EXISTS early_signal_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES early_signals(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  source_url text,
  source_name text,
  extracted_claim text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  reliability_score numeric(5, 2) NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_early_signal_evidence_signal ON early_signal_evidence (signal_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES early_signals(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  channel text NOT NULL,
  recipient text,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false,
  provider_response text,
  retry_count integer NOT NULL DEFAULT 0,
  payload_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_signal ON alert_deliveries (signal_id, channel, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_hash ON alert_deliveries (payload_hash) WHERE payload_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS early_signal_alert_preferences (
  id text PRIMARY KEY DEFAULT 'global',
  breaking_only boolean NOT NULL DEFAULT false,
  high_confidence boolean NOT NULL DEFAULT true,
  daily_digest boolean NOT NULL DEFAULT false,
  all_qualified boolean NOT NULL DEFAULT false,
  quiet_hours_start integer,
  quiet_hours_end integer,
  cities text[] NOT NULL DEFAULT ARRAY['Kansas City']::text[],
  signal_categories text[] NOT NULL DEFAULT '{}'::text[],
  keyword_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO early_signal_alert_preferences (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

-- Rollback (manual):
-- DROP TABLE IF EXISTS alert_deliveries;
-- DROP TABLE IF EXISTS early_signal_evidence;
-- DROP TABLE IF EXISTS early_signals;
-- DROP TABLE IF EXISTS source_snapshots;
-- DROP TABLE IF EXISTS source_watchers;
-- DROP TABLE IF EXISTS early_signal_alert_preferences;
