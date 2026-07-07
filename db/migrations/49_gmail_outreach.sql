-- Gmail OAuth for sponsor outreach + Benson draft metadata

CREATE TABLE IF NOT EXISTS gmail_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_connections_status ON gmail_connections (status);

ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS drafted_by TEXT,
  ADD COLUMN IF NOT EXISTS benson_draft_context JSONB,
  ADD COLUMN IF NOT EXISTS approval_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS send_provider TEXT;

CREATE INDEX IF NOT EXISTS idx_outreach_emails_drafted_by ON outreach_emails (drafted_by);
