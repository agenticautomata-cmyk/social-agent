-- Local Curator Watchlist Intelligence — social roundup discovery + verification

ALTER TABLE source_watchers
  ADD COLUMN IF NOT EXISTS watcher_kind text NOT NULL DEFAULT 'generic';

ALTER TABLE scout_media_assets
  ADD COLUMN IF NOT EXISTS slide_index integer;

CREATE TABLE IF NOT EXISTS curator_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id uuid NOT NULL REFERENCES source_watchers(id) ON DELETE CASCADE,
  scout_item_id uuid REFERENCES scout_items(id) ON DELETE SET NULL,
  post_url text NOT NULL,
  profile_handle text NOT NULL,
  published_at timestamptz,
  caption text,
  post_type text NOT NULL DEFAULT 'unknown',
  source_fingerprint text NOT NULL,
  last_seen_fingerprint text,
  slide_count integer NOT NULL DEFAULT 0,
  outbound_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ephemeral_source boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_curator_posts_fingerprint
  ON curator_social_posts (watcher_id, source_fingerprint);

CREATE INDEX IF NOT EXISTS idx_curator_posts_watcher_detected
  ON curator_social_posts (watcher_id, published_at DESC);

CREATE TABLE IF NOT EXISTS curator_post_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES curator_social_posts(id) ON DELETE CASCADE,
  scout_media_asset_id uuid REFERENCES scout_media_assets(id) ON DELETE SET NULL,
  slide_number integer NOT NULL,
  image_url text,
  storage_path text,
  ocr_text text,
  ocr_status text NOT NULL DEFAULT 'pending',
  ocr_engine text,
  ocr_confidence numeric(5,3),
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_curator_slides_post_number
  ON curator_post_slides (post_id, slide_number);

CREATE TABLE IF NOT EXISTS curator_event_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id uuid NOT NULL REFERENCES source_watchers(id) ON DELETE CASCADE,
  post_id uuid REFERENCES curator_social_posts(id) ON DELETE SET NULL,
  slide_id uuid REFERENCES curator_post_slides(id) ON DELETE SET NULL,
  scout_item_id uuid REFERENCES scout_items(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  event_date date,
  event_time text,
  venue text,
  neighborhood text,
  price text,
  age_restriction text,
  registration_notes text,
  day_heading text,
  discovered_via_handle text NOT NULL,
  discovered_via_post_url text NOT NULL,
  discovered_via_slide_number integer,
  original_quoted_text text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  verification_status text NOT NULL DEFAULT 'SOCIAL_LEAD',
  official_organizer_url text,
  official_venue_url text,
  ticket_url text,
  official_social_url text,
  research_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_notes text,
  verified_at timestamptz,
  creator_recommendation text,
  creator_value_score numeric(5,3),
  creator_value_explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  linked_early_signal_id uuid REFERENCES early_signals(id) ON DELETE SET NULL,
  linked_calendar_item_id uuid REFERENCES creator_calendar_items(id) ON DELETE SET NULL,
  occurrence_fingerprint text NOT NULL,
  dismissed_at timestamptz,
  dismiss_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_curator_leads_fingerprint
  ON curator_event_leads (watcher_id, occurrence_fingerprint);

CREATE INDEX IF NOT EXISTS idx_curator_leads_watcher_status
  ON curator_event_leads (watcher_id, verification_status, event_date);

CREATE INDEX IF NOT EXISTS idx_curator_leads_active
  ON curator_event_leads (dismissed_at, event_date)
  WHERE dismissed_at IS NULL;

CREATE TABLE IF NOT EXISTS curator_reliability_stats (
  watcher_id uuid PRIMARY KEY REFERENCES source_watchers(id) ON DELETE CASCADE,
  leads_extracted integer NOT NULL DEFAULT 0,
  leads_verified integer NOT NULL DEFAULT 0,
  leads_partially_verified integer NOT NULL DEFAULT 0,
  leads_conflicted integer NOT NULL DEFAULT 0,
  leads_expired integer NOT NULL DEFAULT 0,
  verification_rate numeric(5,3),
  conflict_rate numeric(5,3),
  early_post_score numeric(5,3),
  accepted_count integer NOT NULL DEFAULT 0,
  covered_count integer NOT NULL DEFAULT 0,
  reliability_score numeric(5,3),
  noise_rate numeric(5,3),
  posts_processed integer NOT NULL DEFAULT 0,
  slides_processed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO benson_data_revisions (domain, revision)
VALUES ('curator_watchlist', 1)
ON CONFLICT (domain) DO UPDATE SET revision = benson_data_revisions.revision + 1;
