-- Gmail inbox sync: reply tracking + Primary digest dedupe

CREATE TABLE IF NOT EXISTS gmail_sync_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  history_id TEXT,
  last_inbox_sync_at TIMESTAMPTZ,
  last_digest_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gmail_sync_state (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS outreach_inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id TEXT NOT NULL UNIQUE,
  gmail_thread_id TEXT NOT NULL,
  outreach_email_id UUID REFERENCES outreach_emails(id) ON DELETE SET NULL,
  from_email TEXT,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  match_kind TEXT NOT NULL DEFAULT 'unknown',
  is_read BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_inbound_thread ON outreach_inbound_messages (gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_outreach_inbound_outreach ON outreach_inbound_messages (outreach_email_id);
CREATE INDEX IF NOT EXISTS idx_outreach_inbound_unread ON outreach_inbound_messages (is_read) WHERE is_read = false;

CREATE TABLE IF NOT EXISTS gmail_digest_messages (
  gmail_message_id TEXT PRIMARY KEY,
  gmail_thread_id TEXT NOT NULL,
  from_email TEXT,
  subject TEXT,
  snippet TEXT,
  summarized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  telegram_sent_at TIMESTAMPTZ,
  digest_batch_id UUID
);

CREATE INDEX IF NOT EXISTS idx_gmail_digest_telegram ON gmail_digest_messages (telegram_sent_at);
