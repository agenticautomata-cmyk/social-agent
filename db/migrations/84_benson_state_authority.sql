-- Producer authority: email intent/actionability on inbound messages;
-- durable event-level skip identity independent of content_item lifecycle.

ALTER TABLE outreach_inbound_messages
  ADD COLUMN IF NOT EXISTS email_intent text,
  ADD COLUMN IF NOT EXISTS actionability text NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_outreach_inbound_actionability
  ON outreach_inbound_messages (actionability, is_read)
  WHERE actionability <> 'none';

ALTER TABLE creator_skipped_records
  ADD COLUMN IF NOT EXISTS skip_identity_key text;

ALTER TABLE creator_skipped_records
  ALTER COLUMN content_item_id DROP NOT NULL;

ALTER TABLE creator_skipped_records
  DROP CONSTRAINT IF EXISTS creator_skipped_records_content_item_id_fkey;

ALTER TABLE creator_skipped_records
  ADD CONSTRAINT creator_skipped_records_content_item_id_fkey
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_skipped_active_identity
  ON creator_skipped_records (skip_identity_key)
  WHERE restored_at IS NULL AND skip_identity_key IS NOT NULL;
