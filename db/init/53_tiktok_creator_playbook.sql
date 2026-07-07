-- Benson TikTok Creator Playbook — strategy docs + coaching prompts

CREATE TABLE IF NOT EXISTS playbook_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playbook_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           UUID NOT NULL REFERENCES playbook_sources(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  original_filename   TEXT NOT NULL,
  storage_filename    TEXT NOT NULL,
  mime_type           TEXT NOT NULL DEFAULT 'text/html',
  file_size           BIGINT NOT NULL DEFAULT 0,
  page_count          INTEGER,
  chunk_count         INTEGER NOT NULL DEFAULT 0,
  ingested_at         TIMESTAMPTZ,
  source_path         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id)
);

CREATE TABLE IF NOT EXISTS playbook_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES playbook_documents(id) ON DELETE CASCADE,
  source_id       UUID NOT NULL REFERENCES playbook_sources(id) ON DELETE CASCADE,
  page_number     INTEGER,
  section_title   TEXT,
  chunk_index     INTEGER NOT NULL DEFAULT 0,
  chunk_text      TEXT NOT NULL,
  search_vector   tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(section_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(chunk_text, '')), 'B')
  ) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playbook_chunks_fts
  ON playbook_chunks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_playbook_chunks_source
  ON playbook_chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_playbook_chunks_document
  ON playbook_chunks (document_id, chunk_index);

CREATE TABLE IF NOT EXISTS playbook_quick_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  capability      TEXT NOT NULL DEFAULT 'general',
  source_slug     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playbook_quick_actions_sort
  ON playbook_quick_actions (sort_order);

CREATE TABLE IF NOT EXISTS playbook_checklists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  capability        TEXT NOT NULL,
  description       TEXT,
  steps             JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
