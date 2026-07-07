-- Gear Coach — YouTube / web reference videos (practical demos; manuals remain source of truth)

CREATE TABLE IF NOT EXISTS equipment_reference_videos (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                        TEXT NOT NULL UNIQUE,
  title                       TEXT NOT NULL,
  equipment_id                UUID REFERENCES equipment_items(id) ON DELETE SET NULL,
  source_channel              TEXT NOT NULL,
  reference_url               TEXT NOT NULL,
  reference_kind              TEXT NOT NULL DEFAULT 'youtube'
    CHECK (reference_kind IN ('youtube', 'web')),
  youtube_video_id            TEXT,
  topic_tags                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes                       TEXT,
  priority                    INTEGER NOT NULL DEFAULT 50,
  watched_by_kellie           BOOLEAN NOT NULL DEFAULT false,
  useful_for_checklist        BOOLEAN NOT NULL DEFAULT false,
  useful_for_troubleshooting  BOOLEAN NOT NULL DEFAULT false,
  useful_for_training         BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_reference_videos_equipment
  ON equipment_reference_videos (equipment_id, priority);
CREATE INDEX IF NOT EXISTS idx_equipment_reference_videos_priority
  ON equipment_reference_videos (priority);
