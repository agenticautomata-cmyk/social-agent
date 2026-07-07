-- Phase D: analytics connector registry (no credentials — connection state only)

CREATE TABLE IF NOT EXISTS analytics_connectors (
  provider      TEXT PRIMARY KEY CHECK (provider IN ('tiktok', 'facebook', 'instagram', 'youtube')),
  connected     BOOLEAN NOT NULL DEFAULT false,
  account_id    TEXT,
  last_sync_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO analytics_connectors (provider)
VALUES ('tiktok'), ('facebook'), ('instagram'), ('youtube')
ON CONFLICT (provider) DO NOTHING;
