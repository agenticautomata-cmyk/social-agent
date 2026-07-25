-- Discovery mailing-list subscription tracking + email verification

CREATE TABLE IF NOT EXISTS discovery_subscriptions (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name                     TEXT NOT NULL,
  signup_domain                   TEXT,
  signup_url                      TEXT,
  email_address                   TEXT NOT NULL DEFAULT 'discoveries@kckellie.com',
  signup_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_sender_domain          TEXT,
  status                          TEXT NOT NULL DEFAULT 'signup_submitted'
    CHECK (status IN (
      'signup_submitted',
      'awaiting_confirmation',
      'confirmation_received',
      'verified',
      'verification_failed',
      'manual_action_required',
      'active',
      'unsubscribed'
    )),
  confirmation_message_id         UUID REFERENCES discovery_email_messages(id) ON DELETE SET NULL,
  confirmation_link               TEXT,
  verification_code               TEXT,
  verification_attempted_at       TIMESTAMPTZ,
  verification_result             TEXT,
  verification_failure_reason     TEXT,
  manual_review_reason            TEXT,
  blocked_sender                  BOOLEAN NOT NULL DEFAULT false,
  last_email_received_at          TIMESTAMPTZ,
  last_useful_opportunity_at      TIMESTAMPTZ,
  last_opportunity_content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  metadata                        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_subscriptions_status
  ON discovery_subscriptions (status, signup_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_subscriptions_domain
  ON discovery_subscriptions (signup_domain, expected_sender_domain);

CREATE TABLE IF NOT EXISTS discovery_verification_attempts (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id                 UUID NOT NULL REFERENCES discovery_subscriptions(id) ON DELETE CASCADE,
  gmail_message_id                TEXT,
  method                          TEXT NOT NULL
    CHECK (method IN ('auto_link', 'manual_link', 'code_entry', 'blocked')),
  result                          TEXT NOT NULL
    CHECK (result IN ('success', 'failed', 'blocked', 'skipped', 'manual_required')),
  failure_reason                  TEXT,
  final_url                       TEXT,
  redirect_count                  INT,
  http_status                     INT,
  sanitized_link_domain           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_verification_attempts_sub
  ON discovery_verification_attempts (subscription_id, created_at DESC);

ALTER TABLE discovery_email_messages
  ADD COLUMN IF NOT EXISTS message_kind TEXT NOT NULL DEFAULT 'opportunity_signal',
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES discovery_subscriptions(id) ON DELETE SET NULL;

ALTER TABLE discovery_email_messages
  DROP CONSTRAINT IF EXISTS discovery_email_messages_processing_status_check;

ALTER TABLE discovery_email_messages
  ADD CONSTRAINT discovery_email_messages_processing_status_check
  CHECK (processing_status IN (
    'received',
    'processed',
    'duplicate',
    'skipped',
    'failed',
    'confirmation_processed',
    'confirmation_manual',
    'confirmation_blocked'
  ));

CREATE INDEX IF NOT EXISTS idx_discovery_email_subscription
  ON discovery_email_messages (subscription_id)
  WHERE subscription_id IS NOT NULL;
