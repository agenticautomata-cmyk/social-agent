-- Watch-source canonical_key uniqueness for Instagram/social-account upserts.
--
-- Live uniqueness is already this partial unique index (added by
-- migrate-watch-source-canonical-identity.ts after backfill). Drizzle ON CONFLICT
-- (canonical_key) must infer THIS index — a non-partial unique index was never
-- applied, which caused:
--   there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- Idempotent: no-op when the index already exists.

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_watchers_canonical_key_unique
  ON source_watchers (canonical_key)
  WHERE canonical_key IS NOT NULL;
