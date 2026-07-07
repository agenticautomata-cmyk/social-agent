-- Benson Equipment Expert / Gear Coach — manual ingestion + checklists

CREATE TABLE IF NOT EXISTS equipment_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  brand             TEXT NOT NULL,
  model             TEXT NOT NULL,
  category          TEXT NOT NULL,
  owner             TEXT NOT NULL DEFAULT 'Kellie',
  manual_file_path  TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_manuals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id        UUID NOT NULL REFERENCES equipment_items(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  original_filename   TEXT NOT NULL,
  storage_filename    TEXT NOT NULL,
  mime_type           TEXT NOT NULL DEFAULT 'application/pdf',
  file_size           BIGINT NOT NULL DEFAULT 0,
  page_count          INTEGER,
  chunk_count         INTEGER NOT NULL DEFAULT 0,
  ingested_at         TIMESTAMPTZ,
  source_path         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (equipment_id)
);

CREATE TABLE IF NOT EXISTS equipment_manual_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id       UUID NOT NULL REFERENCES equipment_manuals(id) ON DELETE CASCADE,
  equipment_id    UUID NOT NULL REFERENCES equipment_items(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_equipment_manual_chunks_fts
  ON equipment_manual_chunks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_equipment_manual_chunks_equipment
  ON equipment_manual_chunks (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_manual_chunks_manual
  ON equipment_manual_chunks (manual_id, chunk_index);

CREATE TABLE IF NOT EXISTS equipment_quick_tips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    UUID REFERENCES equipment_items(id) ON DELETE CASCADE,
  topic           TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  source_manual   TEXT,
  source_page     INTEGER,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_quick_tips_equipment
  ON equipment_quick_tips (equipment_id, sort_order);

CREATE TABLE IF NOT EXISTS equipment_checklists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  shoot_type        TEXT NOT NULL,
  description       TEXT,
  gear_to_bring     JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps             JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_mistakes   JSONB NOT NULL DEFAULT '[]'::jsonb,
  recovery_steps    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_troubleshooting (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  equipment_id    UUID REFERENCES equipment_items(id) ON DELETE SET NULL,
  symptoms        JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps           JSONB NOT NULL DEFAULT '[]'::jsonb,
  quick_prompt    TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_troubleshooting_sort
  ON equipment_troubleshooting (sort_order);
