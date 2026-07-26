-- URL intake qualification — quarantine + persistent watch scope

CREATE TABLE IF NOT EXISTS url_intake_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  page_url text,
  user_message text,
  extracted_title text,
  extracted_location text,
  extracted_event_date date,
  rejection_code text NOT NULL,
  rejection_reason text NOT NULL,
  entity_name text,
  entity_domain text,
  location_scope text,
  raw_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_url_quarantine_domain
  ON url_intake_quarantine (entity_domain, created_at DESC);

CREATE TABLE IF NOT EXISTS url_watch_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  business_name text,
  location_scope text,
  city_scope text DEFAULT 'Kansas City metro',
  category_scope text,
  exclude_branches jsonb NOT NULL DEFAULT '[]'::jsonb,
  watcher_id uuid REFERENCES source_watchers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_url_watch_rules_domain_scope
  ON url_watch_rules (domain, COALESCE(location_scope, ''));

CREATE TABLE IF NOT EXISTS url_intake_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  action text NOT NULL,
  reason_code text NOT NULL,
  reason_detail text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_url_intake_audit_item
  ON url_intake_audit (content_item_id, performed_at DESC);
