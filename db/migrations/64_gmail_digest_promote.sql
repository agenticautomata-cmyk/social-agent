-- Gmail digest promotion / dismissal tracking

ALTER TABLE gmail_digest_messages
  ADD COLUMN IF NOT EXISTS promoted_content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gmail_digest_action_status
  ON gmail_digest_messages (action_status, summarized_at DESC);
