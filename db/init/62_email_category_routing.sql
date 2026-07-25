-- Email category routing for Gmail digest + inbox

ALTER TABLE gmail_digest_messages
  ADD COLUMN IF NOT EXISTS channel_id TEXT,
  ADD COLUMN IF NOT EXISTS email_category TEXT,
  ADD COLUMN IF NOT EXISTS discovery_intent TEXT,
  ADD COLUMN IF NOT EXISTS original_recipient TEXT,
  ADD COLUMN IF NOT EXISTS matched_header TEXT,
  ADD COLUMN IF NOT EXISTS from_name TEXT,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

ALTER TABLE outreach_inbound_messages
  ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT 'sponsors',
  ADD COLUMN IF NOT EXISTS email_category TEXT NOT NULL DEFAULT 'sponsor',
  ADD COLUMN IF NOT EXISTS original_recipient TEXT,
  ADD COLUMN IF NOT EXISTS matched_header TEXT;

ALTER TABLE discovery_email_messages
  ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT 'discoveries',
  ADD COLUMN IF NOT EXISTS email_category TEXT NOT NULL DEFAULT 'discovery',
  ADD COLUMN IF NOT EXISTS discovery_intent TEXT,
  ADD COLUMN IF NOT EXISTS matched_header TEXT;

CREATE INDEX IF NOT EXISTS idx_gmail_digest_category
  ON gmail_digest_messages (email_category, summarized_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_email_intent
  ON discovery_email_messages (discovery_intent, received_at DESC);

-- Safe backfill: discovery messages should never be categorized as sponsor
UPDATE discovery_email_messages
SET
  channel_id = 'discoveries',
  email_category = 'discovery',
  discovery_intent = COALESCE(
    NULLIF(message_kind, 'opportunity_signal'),
    message_kind,
    'discovery_other'
  )
WHERE email_category IS NULL OR email_category = 'sponsor';

UPDATE discovery_email_messages
SET discovery_intent = 'discovery_subscription_confirmation'
WHERE message_kind = 'discovery_subscription_confirmation'
  AND (discovery_intent IS NULL OR discovery_intent = 'discovery_other');

UPDATE gmail_digest_messages g
SET
  channel_id = 'discoveries',
  email_category = 'discovery',
  discovery_intent = COALESCE(d.discovery_intent, 'discovery_other'),
  original_recipient = COALESCE(g.original_recipient, d.original_recipient),
  matched_header = COALESCE(g.matched_header, 'Delivered-To')
FROM discovery_email_messages d
WHERE d.gmail_message_id = g.gmail_message_id
  AND (g.email_category IS NULL OR g.email_category = 'sponsor');
