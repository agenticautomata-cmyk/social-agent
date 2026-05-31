-- Phase A: Editor home — shortlist, covered, notes, follow-ups

CREATE TABLE IF NOT EXISTS editor_opportunity_tracking (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id   UUID NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
  saved             BOOLEAN NOT NULL DEFAULT false,
  covered           BOOLEAN NOT NULL DEFAULT false,
  note              TEXT,
  follow_up_at      TIMESTAMPTZ,
  saved_at          TIMESTAMPTZ,
  covered_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_editor_tracking_saved ON editor_opportunity_tracking (saved, saved_at DESC)
  WHERE saved = true;

CREATE INDEX IF NOT EXISTS idx_editor_tracking_covered ON editor_opportunity_tracking (covered, covered_at DESC)
  WHERE covered = true;

CREATE INDEX IF NOT EXISTS idx_editor_tracking_follow_up ON editor_opportunity_tracking (follow_up_at)
  WHERE follow_up_at IS NOT NULL AND covered = false;
