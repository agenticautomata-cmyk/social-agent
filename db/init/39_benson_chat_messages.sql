-- Ask Benson chat — persistent conversation history

CREATE TABLE IF NOT EXISTS benson_chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_usage     JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost  NUMERIC(12, 6) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_benson_chat_creator_conversation
  ON benson_chat_messages (creator_id, conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_benson_chat_cache_lookup
  ON benson_chat_messages (creator_id, created_at DESC);
