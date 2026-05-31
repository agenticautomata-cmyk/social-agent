-- Phase A: Share-to-Benson manual intake submissions

CREATE TYPE intake_type AS ENUM ('url', 'text', 'image', 'mixed');

CREATE TYPE intake_review_status AS ENUM (
  'pending_ai',
  'needs_review',
  'approved',
  'rejected'
);

CREATE TYPE intake_source_type AS ENUM ('manual_share');

CREATE TABLE share_intake_submissions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id               UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source_type               intake_source_type NOT NULL DEFAULT 'manual_share',
  intake_type               intake_type NOT NULL,
  original_url              TEXT,
  raw_text                  TEXT,
  notes                     TEXT,
  uploaded_image_path       TEXT,
  uploaded_image_url        TEXT,
  ai_summary                TEXT,
  extracted_title           TEXT,
  extracted_date            TIMESTAMPTZ,
  extracted_location        TEXT,
  extracted_business        TEXT,
  extracted_category        TEXT,
  extracted_tags            TEXT[] NOT NULL DEFAULT '{}',
  confidence_score          NUMERIC(4, 3),
  review_status             intake_review_status NOT NULL DEFAULT 'needs_review',
  rejection_reason          TEXT,
  promoted_content_item_id  UUID REFERENCES content_items(id) ON DELETE SET NULL,
  submitted_by              TEXT NOT NULL,
  submitted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by               TEXT,
  reviewed_at               TIMESTAMPTZ,
  client_metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_share_intake_campaign_status
  ON share_intake_submissions (campaign_id, review_status, submitted_at DESC);

CREATE INDEX idx_share_intake_promoted
  ON share_intake_submissions (promoted_content_item_id)
  WHERE promoted_content_item_id IS NOT NULL;
