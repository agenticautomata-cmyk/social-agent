-- Token rotation table — stores long-lived OAuth tokens per platform per
-- publishing target, with explicit expiry so the rotator knows when to refresh.

CREATE TABLE platform_credentials (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_id         UUID NOT NULL REFERENCES publishing_targets(id) ON DELETE CASCADE,

  -- Active credentials (rotated in place)
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,

  -- App-level credentials needed for refresh (encrypted at rest in production)
  client_id         TEXT,
  client_secret     TEXT,

  -- Metadata
  scope             TEXT,
  last_rotated_at   TIMESTAMPTZ,
  last_rotation_error TEXT,
  rotation_attempts INT NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (target_id)
);

CREATE INDEX idx_credentials_expiry ON platform_credentials(expires_at);

CREATE TRIGGER credentials_updated_at
  BEFORE UPDATE ON platform_credentials
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
