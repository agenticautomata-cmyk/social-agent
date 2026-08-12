-- Benson Workspace conversation metadata.
-- Existing conversation UUIDs remain authoritative; this table makes them listable
-- and resumable without changing the append-only message history.

CREATE TABLE IF NOT EXISTS benson_conversations (
  id                     UUID PRIMARY KEY,
  creator_id             UUID NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  title_source           TEXT NOT NULL DEFAULT 'auto'
                           CHECK (title_source IN ('auto', 'user')),
  primary_partnership_id UUID REFERENCES creator_partnerships(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at        TIMESTAMPTZ NOT NULL,
  last_message_preview   TEXT,
  last_opened_at         TIMESTAMPTZ,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Deterministic backfill:
-- * first/last ties are resolved by message UUID
-- * the first user line is preferred for the automatic title
-- * reruns never overwrite user edits or newer metadata
WITH ranked AS (
  SELECT
    message.*,
    row_number() OVER (
      PARTITION BY conversation_id
      ORDER BY created_at ASC, id ASC
    ) AS first_rank,
    row_number() OVER (
      PARTITION BY conversation_id
      ORDER BY (role = 'user') DESC, created_at ASC, id ASC
    ) AS title_rank,
    row_number() OVER (
      PARTITION BY conversation_id
      ORDER BY created_at DESC, id DESC
    ) AS last_rank
  FROM benson_chat_messages AS message
),
backfill AS (
  SELECT
    conversation_id AS id,
    (array_agg(creator_id ORDER BY first_rank))[1] AS creator_id,
    COALESCE(
      NULLIF(
        LEFT(
          regexp_replace(
            split_part((array_agg(message ORDER BY title_rank))[1], E'\n', 1),
            '\s+',
            ' ',
            'g'
          ),
          120
        ),
        ''
      ),
      'New conversation'
    ) AS title,
    min(created_at) AS created_at,
    max(created_at) AS last_message_at,
    NULLIF(
      LEFT(
        regexp_replace((array_agg(message ORDER BY last_rank))[1], '\s+', ' ', 'g'),
        240
      ),
      ''
    ) AS last_message_preview
  FROM ranked
  GROUP BY conversation_id
)
INSERT INTO benson_conversations (
  id,
  creator_id,
  title,
  title_source,
  created_at,
  updated_at,
  last_message_at,
  last_message_preview
)
SELECT
  id,
  creator_id,
  title,
  'auto',
  created_at,
  last_message_at,
  last_message_at,
  last_message_preview
FROM backfill
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_benson_conversations_creator_recent
  ON benson_conversations (creator_id, last_message_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_benson_conversations_creator_opened
  ON benson_conversations (creator_id, last_opened_at DESC)
  WHERE last_opened_at IS NOT NULL;
