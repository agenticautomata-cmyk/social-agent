-- Per-message Ask Benson feedback (thumbs up/down) for the learning loop.

CREATE TABLE IF NOT EXISTS benson_chat_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES benson_chat_messages(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  sentiment   TEXT NOT NULL CHECK (sentiment IN ('up', 'down')),
  reason_code TEXT,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_benson_chat_feedback_creator_created
  ON benson_chat_feedback (creator_id, created_at DESC);
