-- Watch-source canonical identity — fixes the @jasfoodjourney duplicate-row bug.
--
-- Root cause: `ensureCuratorWatcher()` compared a slash-stripped input URL against a
-- slash-having stored `source_watchers.source_url`, so the "already exists" lookup
-- never matched and every call inserted a fresh row. `createWatchedSource()` also did
-- a blind insert with no uniqueness check at all.
--
-- This migration only adds the column. The unique index is added by
-- `migrate-watch-source-canonical-identity.ts` AFTER it backfills canonical_key for
-- every existing row and merges any resulting duplicates (that logic needs real
-- URL-normalization code, not raw SQL, to be correct).

ALTER TABLE source_watchers
  ADD COLUMN IF NOT EXISTS canonical_key text;

CREATE INDEX IF NOT EXISTS idx_source_watchers_canonical_key_lookup
  ON source_watchers (canonical_key);

INSERT INTO benson_data_revisions (domain, revision)
VALUES ('benson_scout', 1)
ON CONFLICT (domain) DO UPDATE SET revision = benson_data_revisions.revision + 1;
