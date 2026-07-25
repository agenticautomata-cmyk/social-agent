-- Green Screen coverage format + discovery email ingestion

DO $$ BEGIN
  CREATE TYPE coverage_format AS ENUM (
    'field_visit',
    'green_screen',
    'green_screen_then_visit',
    'roundup',
    'track_only'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS coverage_format coverage_format,
  ADD COLUMN IF NOT EXISTS suggested_coverage_format coverage_format,
  ADD COLUMN IF NOT EXISTS firsthand_visited BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS green_screen_packages (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id                 UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  status                          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'prepared', 'completed')),
  suggested_headline              TEXT,
  opening_hook                    TEXT,
  spoken_script                   TEXT,
  key_facts                       JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_dates                     TEXT,
  location                        TEXT,
  price_or_offer                  TEXT,
  restrictions                    TEXT,
  background_sources              JSONB NOT NULL DEFAULT '[]'::jsonb,
  on_screen_text                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  caption                         TEXT,
  hashtags                        JSONB NOT NULL DEFAULT '[]'::jsonb,
  call_to_action                  TEXT,
  source_attribution              TEXT,
  verification_status             TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('verified', 'partial', 'unverified', 'expired')),
  verification_flags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  visit_later_notes               TEXT,
  duplicate_of_content_item_id    UUID REFERENCES content_items(id) ON DELETE SET NULL,
  prepared_at                     TIMESTAMPTZ,
  completed_at                    TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_green_screen_packages_content
  ON green_screen_packages (content_item_id);

ALTER TABLE planner_items
  ADD COLUMN IF NOT EXISTS green_screen_status TEXT
    CHECK (green_screen_status IS NULL OR green_screen_status IN ('draft', 'prepared', 'completed')),
  ADD COLUMN IF NOT EXISTS visit_reminder_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS discovery_email_messages (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id                TEXT NOT NULL UNIQUE,
  gmail_thread_id                 TEXT,
  original_recipient              TEXT,
  sender_email                    TEXT,
  sender_name                     TEXT,
  subject                         TEXT,
  received_at                     TIMESTAMPTZ,
  body_text                       TEXT,
  urls                            JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachment_metadata             JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_item_id                 UUID REFERENCES content_items(id) ON DELETE SET NULL,
  duplicate_of_content_item_id    UUID REFERENCES content_items(id) ON DELETE SET NULL,
  processing_status               TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'duplicate', 'skipped', 'failed')),
  processing_error                TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_email_received
  ON discovery_email_messages (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_email_content
  ON discovery_email_messages (content_item_id)
  WHERE content_item_id IS NOT NULL;
