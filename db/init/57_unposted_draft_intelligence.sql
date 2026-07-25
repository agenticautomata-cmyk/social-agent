-- Unposted Draft Intelligence — private draft assets and structured decisions

DO $$ BEGIN
  CREATE TYPE draft_source_channel AS ENUM (
    'share_to_benson',
    'telegram',
    'manual_upload',
    'transcript_paste',
    'future_tiktok_api'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE draft_source_type AS ENUM (
    'video',
    'audio',
    'transcript',
    'caption_file',
    'screenshot',
    'mixed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE draft_confidence_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE draft_asset_status AS ENUM (
    'received',
    'processing',
    'analyzed',
    'needs_review',
    'ready_to_post',
    'hold',
    'revise',
    'scheduled',
    'handed_off',
    'posted',
    'completed',
    'scrapped',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE draft_decision_type AS ENUM (
    'post_now',
    'schedule',
    'hold',
    'revise',
    'scrap',
    'convert_to_sequel',
    'use_for_sponsor',
    'add_to_planner',
    'needs_more_footage',
    'link_opportunity',
    'mark_posted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS creator_draft_assets (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id                  uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  source_channel              draft_source_channel NOT NULL DEFAULT 'share_to_benson',
  source_type                 draft_source_type NOT NULL,
  share_intake_id             uuid REFERENCES share_intake_submissions(id) ON DELETE SET NULL,
  original_filename           text,
  mime_type                   text,
  file_size                   bigint,
  duration_seconds            numeric(10, 2),
  temp_file_path              text,
  draft_title                 text,
  user_note                   text,
  raw_caption_or_text         text,
  transcript_text             text,
  transcript_segments_json    jsonb,
  visual_summary              text,
  audio_summary               text,
  overall_summary             text,
  frame_summaries_json        jsonb,
  detected_products_json      jsonb,
  detected_brands_json        jsonb,
  detected_locations_json     jsonb,
  detected_people_or_roles_json jsonb,
  detected_content_theme      text,
  detected_format             text,
  hook_assessment             text,
  pacing_assessment           text,
  visual_quality_notes        text,
  audio_quality_notes         text,
  lighting_notes              text,
  possible_cover_text         text,
  best_cover_frame_notes      text,
  suggested_caption           text,
  suggested_hashtags_json     jsonb,
  suggested_first_comment     text,
  suggested_platforms_json    jsonb,
  suggested_post_window       text,
  post_now_score              numeric(4, 3),
  readiness_score             numeric(4, 3),
  sponsor_relevance_score     numeric(4, 3),
  opportunity_match_score     numeric(4, 3),
  confidence_level            draft_confidence_level,
  context_limitations         text,
  posting_recommendation_json jsonb,
  opportunity_match_json      jsonb,
  status                      draft_asset_status NOT NULL DEFAULT 'received',
  processing_error            text,
  linked_opportunity_id       uuid REFERENCES content_items(id) ON DELETE SET NULL,
  linked_planner_item_id      uuid REFERENCES planner_items(id) ON DELETE SET NULL,
  linked_post_package_id      uuid REFERENCES tiktok_post_packages(id) ON DELETE SET NULL,
  linked_tiktok_video_id      uuid REFERENCES creator_videos(id) ON DELETE SET NULL,
  linked_sponsor_proof_id     uuid,
  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  analyzed_at                 timestamptz,
  last_discussed_at           timestamptz,
  decided_at                  timestamptz,
  posted_at                   timestamptz,
  completed_at                timestamptz
);

CREATE INDEX IF NOT EXISTS idx_creator_draft_assets_creator_status
  ON creator_draft_assets (creator_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_draft_assets_share_intake
  ON creator_draft_assets (share_intake_id)
  WHERE share_intake_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS draft_decisions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id              uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  draft_asset_id          uuid NOT NULL REFERENCES creator_draft_assets(id) ON DELETE CASCADE,
  decision_type           draft_decision_type NOT NULL,
  decision_summary        text NOT NULL,
  reason                  text,
  decided_by              text NOT NULL DEFAULT 'creator',
  scheduled_for           timestamptz,
  target_platforms_json   jsonb,
  linked_post_package_id  uuid REFERENCES tiktok_post_packages(id) ON DELETE SET NULL,
  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draft_decisions_asset
  ON draft_decisions (draft_asset_id, created_at DESC);
