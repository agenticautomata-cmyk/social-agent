-- Share to Benson: video/audio understanding pipeline fields (fresh init)

DO $$ BEGIN
  ALTER TYPE intake_type ADD VALUE 'video';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE intake_type ADD VALUE 'audio';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE intake_source_type ADD VALUE 'share_to_benson';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE intake_processing_status AS ENUM (
    'received',
    'queued',
    'extracting_audio',
    'transcribing',
    'analyzing',
    'ready',
    'failed',
    'too_large'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE share_intake_submissions
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES creator_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS duration_seconds numeric(10, 2),
  ADD COLUMN IF NOT EXISTS temp_file_path text,
  ADD COLUMN IF NOT EXISTS transcript_text text,
  ADD COLUMN IF NOT EXISTS transcript_segments_json jsonb,
  ADD COLUMN IF NOT EXISTS content_theme text,
  ADD COLUMN IF NOT EXISTS hook_summary text,
  ADD COLUMN IF NOT EXISTS key_moments_json jsonb,
  ADD COLUMN IF NOT EXISTS sponsor_relevance text,
  ADD COLUMN IF NOT EXISTS detected_products_json jsonb,
  ADD COLUMN IF NOT EXISTS detected_brands_json jsonb,
  ADD COLUMN IF NOT EXISTS detected_locations_json jsonb,
  ADD COLUMN IF NOT EXISTS caption_suggestions_json jsonb,
  ADD COLUMN IF NOT EXISTS hashtag_suggestions_json jsonb,
  ADD COLUMN IF NOT EXISTS follow_up_ideas_json jsonb,
  ADD COLUMN IF NOT EXISTS processing_status intake_processing_status,
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS linked_post_package_id uuid REFERENCES tiktok_post_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_planner_item_id uuid REFERENCES planner_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_share_intake_processing
  ON share_intake_submissions (processing_status, submitted_at DESC)
  WHERE processing_status IS NOT NULL;
