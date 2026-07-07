-- Benson milestone celebrations (one-time events like follower milestones).

CREATE TABLE IF NOT EXISTS benson_milestones (
  id              TEXT PRIMARY KEY,
  reached_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  follower_count  INTEGER,
  push_sent_at    TIMESTAMPTZ,
  celebrated_at   TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);
