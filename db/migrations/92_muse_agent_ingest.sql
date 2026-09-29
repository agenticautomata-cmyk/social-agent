-- Muse agent ingest — untrusted source audit + fingerprint idempotency.
-- Unique (source, fingerprint) mirrors scout (watcher_id, occurrence_fingerprint).

CREATE TABLE IF NOT EXISTS muse_ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  item_count integer NOT NULL DEFAULT 0,
  dispositions jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'running',
  error text
);

CREATE INDEX IF NOT EXISTS idx_muse_ingest_runs_started
  ON muse_ingest_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS muse_ingest_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES muse_ingest_runs(id) ON DELETE SET NULL,
  source text NOT NULL,
  fingerprint text NOT NULL,
  item_type text NOT NULL,
  disposition text NOT NULL,
  reason text NOT NULL,
  canonical_url text,
  raw_item jsonb NOT NULL,
  routed_kind text,
  routed_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_muse_ingest_items_source_fingerprint
  ON muse_ingest_items (source, fingerprint);
