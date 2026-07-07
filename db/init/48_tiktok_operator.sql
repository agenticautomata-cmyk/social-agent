-- TikTok Operator Execution Layer
-- Safe to re-run (IF NOT EXISTS / duplicate_object guards)

DO $$ BEGIN
  CREATE TYPE tiktok_operator_recommendation_type AS ENUM (
    'make_sequel',
    'reply_with_video',
    'add_to_media_kit',
    'build_sponsor_proof',
    'create_outreach_angle',
    'repeat_format',
    'repost_or_remix',
    'schedule_follow_up',
    'prepare_for_tiktok',
    'investigate_comment_trend',
    'create_product_or_location_followup'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tiktok_operator_recommendation_status AS ENUM (
    'new', 'accepted', 'in_progress', 'prepared', 'scheduled', 'completed', 'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tiktok_post_package_status AS ENUM (
    'draft', 'ready', 'scheduled', 'handed_off', 'posted_manual', 'posted_confirmed', 'failed', 'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tiktok_media_source_type AS ENUM (
    'none', 'local_reference', 'temporary_upload', 'external_url', 'tiktok_draft', 'cloud_asset'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tiktok_handoff_method AS ENUM (
    'manual', 'deep_link', 'clipboard', 'future_tiktok_upload', 'future_direct_post'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tiktok_handoff_status AS ENUM (
    'pending', 'ready', 'handed_off', 'posted', 'failed', 'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tiktok_comment_insight_type AS ENUM (
    'repeated_question', 'product_request', 'location_request', 'sizing_price_where_to_buy',
    'complaint_confusion', 'brand_mention', 'sponsor_relevant', 'reply_video_worthy',
    'sequel_suggestion', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tiktok_comment_insight_status AS ENUM (
    'new', 'actioned', 'dismissed', 'handled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tiktok_post_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  platform platform NOT NULL DEFAULT 'tiktok',
  recommendation_id uuid,
  creator_video_id uuid REFERENCES creator_videos(id) ON DELETE SET NULL,
  source_video_id text,
  related_content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  hook text,
  caption text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}'::text[],
  cover_text text,
  first_comment text,
  disclosure_text text,
  suggested_post_time timestamptz,
  scheduled_at timestamptz,
  sponsor_angle text,
  content_theme text,
  format_label text,
  reason text,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  shot_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta text,
  location_brand_notes text,
  status tiktok_post_package_status NOT NULL DEFAULT 'draft',
  media_source_type tiktok_media_source_type NOT NULL DEFAULT 'none',
  media_reference_text text,
  temporary_asset_id uuid,
  handoff_method tiktok_handoff_method NOT NULL DEFAULT 'manual',
  handoff_status tiktok_handoff_status NOT NULL DEFAULT 'pending',
  handoff_error text,
  handed_off_at timestamptz,
  posted_at timestamptz,
  posted_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tiktok_operator_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  platform platform NOT NULL DEFAULT 'tiktok',
  source_video_id text,
  creator_video_id uuid REFERENCES creator_videos(id) ON DELETE SET NULL,
  recommendation_type tiktok_operator_recommendation_type NOT NULL,
  title text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  supporting_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5, 4) NOT NULL DEFAULT 0.5,
  priority integer NOT NULL DEFAULT 2,
  status tiktok_operator_recommendation_status NOT NULL DEFAULT 'new',
  related_content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  related_sponsor_tag text,
  related_location_tag text,
  post_package_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  completed_at timestamptz
);

DO $$ BEGIN
  ALTER TABLE tiktok_operator_recommendations
    ADD CONSTRAINT fk_tiktok_operator_recs_post_package
    FOREIGN KEY (post_package_id) REFERENCES tiktok_post_packages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tiktok_operator_recs_creator_status
  ON tiktok_operator_recommendations (creator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tiktok_operator_recs_video_type
  ON tiktok_operator_recommendations (creator_id, source_video_id, recommendation_type);
CREATE INDEX IF NOT EXISTS idx_tiktok_post_packages_creator_status
  ON tiktok_post_packages (creator_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS tiktok_comment_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  platform platform NOT NULL DEFAULT 'tiktok',
  source_video_id text NOT NULL,
  creator_video_id uuid REFERENCES creator_videos(id) ON DELETE SET NULL,
  comment_text text,
  cluster_summary text,
  insight_type tiktok_comment_insight_type NOT NULL DEFAULT 'other',
  frequency integer NOT NULL DEFAULT 1,
  recommendation text NOT NULL DEFAULT '',
  post_package_id uuid REFERENCES tiktok_post_packages(id) ON DELETE SET NULL,
  status tiktok_comment_insight_status NOT NULL DEFAULT 'new',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tiktok_comment_insights_creator_status
  ON tiktok_comment_insights (creator_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS sponsor_proof_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  platform platform NOT NULL DEFAULT 'tiktok',
  source_video_id text NOT NULL,
  creator_video_id uuid REFERENCES creator_videos(id) ON DELETE SET NULL,
  video_title text NOT NULL DEFAULT '',
  video_caption text,
  thumbnail_url text,
  share_url text,
  performance_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  engagement_rate numeric(8, 4),
  content_category text,
  brand_relevance text,
  notes text,
  proof_headline text NOT NULL DEFAULT '',
  proof_summary text NOT NULL DEFAULT '',
  included_in_media_kit boolean NOT NULL DEFAULT false,
  media_kit_id uuid REFERENCES media_kits(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_proof_assets_creator
  ON sponsor_proof_assets (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_format_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  format_name text NOT NULL,
  structure text NOT NULL DEFAULT '',
  ideal_length text,
  opening_hook_style text,
  shot_pattern jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_content_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  proof_video_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  avg_performance_index numeric(6, 2),
  when_to_use text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_format_templates_creator
  ON creator_format_templates (creator_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS tiktok_operator_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  period text NOT NULL DEFAULT 'daily',
  briefing_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text NOT NULL DEFAULT '',
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_operator_briefings_creator_date
  ON tiktok_operator_briefings (creator_id, briefing_date DESC);

CREATE TABLE IF NOT EXISTS tiktok_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  post_package_id uuid NOT NULL REFERENCES tiktok_post_packages(id) ON DELETE CASCADE,
  handoff_method tiktok_handoff_method NOT NULL,
  handoff_status tiktok_handoff_status NOT NULL,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_handoff_events_package
  ON tiktok_handoff_events (post_package_id, created_at DESC);
