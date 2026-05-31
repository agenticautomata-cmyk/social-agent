-- Phase B: Live sponsor outreach sends

ALTER TYPE outreach_email_status ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE outreach_email_status ADD VALUE IF NOT EXISTS 'sent';

ALTER TYPE outreach_send_attempt_status ADD VALUE IF NOT EXISTS 'sent';

ALTER TABLE outreach_send_attempts
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT;
