-- Phase A: Creator analytics (platform-agnostic; TikTok import first)

CREATE TABLE IF NOT EXISTS creator_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            platform NOT NULL,
  username            TEXT NOT NULL,
  display_name        TEXT,
  profile_url         TEXT,
  avatar_url          TEXT,
  connection_status   TEXT NOT NULL DEFAULT 'import_only',
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, username)
);

CREATE TABLE IF NOT EXISTS creator_videos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  platform            platform NOT NULL,
  video_id            TEXT NOT NULL,
  title               TEXT,
  caption             TEXT,
  post_url            TEXT,
  thumbnail_url       TEXT,
  published_at        TIMESTAMPTZ NOT NULL,
  content_category    TEXT,
  content_pillar      TEXT,
  location_tag        TEXT,
  sponsor_tag         TEXT,
  opportunity_id      UUID REFERENCES content_items(id) ON DELETE SET NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, video_id)
);

CREATE TABLE IF NOT EXISTS creator_metrics_snapshots (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id                        UUID NOT NULL REFERENCES creator_videos(id) ON DELETE CASCADE,
  views                           BIGINT NOT NULL DEFAULT 0,
  likes                           INTEGER NOT NULL DEFAULT 0,
  comments                        INTEGER NOT NULL DEFAULT 0,
  shares                          INTEGER NOT NULL DEFAULT 0,
  saves                           INTEGER,
  engagement_rate                 NUMERIC(8, 4),
  watch_time_seconds              BIGINT,
  average_watch_duration_seconds  NUMERIC(10, 2),
  completion_rate                 NUMERIC(6, 4),
  follower_count_snapshot         INTEGER,
  collected_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source                          TEXT NOT NULL DEFAULT 'import',
  raw                             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_accounts_platform ON creator_accounts (platform);
CREATE INDEX IF NOT EXISTS idx_creator_videos_account ON creator_videos (account_id);
CREATE INDEX IF NOT EXISTS idx_creator_videos_published ON creator_videos (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_videos_platform ON creator_videos (platform);
CREATE INDEX IF NOT EXISTS idx_creator_videos_category ON creator_videos (content_category)
  WHERE content_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_videos_location ON creator_videos (location_tag)
  WHERE location_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_metrics_video_collected
  ON creator_metrics_snapshots (video_id, collected_at DESC);
