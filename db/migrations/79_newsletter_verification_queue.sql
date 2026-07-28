-- Newsletter verification queue for official-source cross-checks

CREATE TABLE IF NOT EXISTS newsletter_verification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid REFERENCES content_items(id) ON DELETE CASCADE,
  occurrence_fingerprint text,
  entity_name text,
  occurrence_title text,
  newsletter_claim jsonb NOT NULL DEFAULT '{}'::jsonb,
  official_claim jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status text NOT NULL DEFAULT 'newsletter_only',
  conflicting_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_official_url text,
  verification_priority integer NOT NULL DEFAULT 6,
  gmail_message_id text,
  newsletter_source_id uuid REFERENCES newsletter_sources(id) ON DELETE SET NULL,
  last_verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_verification_status
  ON newsletter_verification_queue (verification_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_verification_fingerprint
  ON newsletter_verification_queue (occurrence_fingerprint)
  WHERE occurrence_fingerprint IS NOT NULL;
