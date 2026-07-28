-- Newsletter intelligence: sources, evidence, extended email tracking

CREATE TABLE IF NOT EXISTS newsletter_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email text,
  sender_domain text NOT NULL,
  sender_name text,
  category text NOT NULL DEFAULT 'local_newsletter',
  status text NOT NULL DEFAULT 'suggested',
  discovery_subscription_id uuid REFERENCES discovery_subscriptions(id) ON DELETE SET NULL,
  last_email_received_at timestamptz,
  last_successful_parse_at timestamptz,
  emails_processed integer NOT NULL DEFAULT 0,
  entities_extracted integer NOT NULL DEFAULT 0,
  occurrences_extracted integer NOT NULL DEFAULT 0,
  verified_item_count integer NOT NULL DEFAULT 0,
  duplicate_merge_count integer NOT NULL DEFAULT 0,
  quarantined_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_sources_domain
  ON newsletter_sources (sender_domain);

CREATE INDEX IF NOT EXISTS idx_newsletter_sources_status
  ON newsletter_sources (status, last_email_received_at DESC);

CREATE TABLE IF NOT EXISTS inventory_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  evidence_type text NOT NULL DEFAULT 'newsletter_email',
  source_label text,
  gmail_message_id text,
  discovery_email_message_id uuid REFERENCES discovery_email_messages(id) ON DELETE SET NULL,
  newsletter_source_id uuid REFERENCES newsletter_sources(id) ON DELETE SET NULL,
  source_url text,
  canonical_source_url text,
  received_at timestamptz,
  verification_status text NOT NULL DEFAULT 'newsletter_only',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_evidence_content
  ON inventory_evidence (content_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_evidence_gmail
  ON inventory_evidence (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_evidence_dedupe
  ON inventory_evidence (content_item_id, gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

ALTER TABLE discovery_email_messages
  ADD COLUMN IF NOT EXISTS newsletter_category text,
  ADD COLUMN IF NOT EXISTS sender_domain text,
  ADD COLUMN IF NOT EXISTS content_fingerprint text,
  ADD COLUMN IF NOT EXISTS newsletter_source_id uuid REFERENCES newsletter_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entities_extracted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS occurrences_extracted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quarantined_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_discovery_email_fingerprint
  ON discovery_email_messages (content_fingerprint)
  WHERE content_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_email_newsletter_source
  ON discovery_email_messages (newsletter_source_id, received_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dry_run boolean NOT NULL DEFAULT true,
  since_days integer NOT NULL DEFAULT 180,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running'
);
