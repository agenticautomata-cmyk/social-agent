-- Visual production system: design projects, versions, facts, assets, exports,
-- approvals, and image-generation attempt ledger.
-- Additive and idempotent. Image gen remains disabled by application flags.

DO $$ BEGIN
  CREATE TYPE design_project_kind AS ENUM ('weekend_drop', 'media_kit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE design_project_status AS ENUM ('draft', 'approved', 'revoked', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE design_page_role AS ENUM ('cover', 'day', 'cta', 'kit_section');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE image_art_kind AS ENUM ('background', 'texture', 'editorial_illustration');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE image_art_provider_id AS ENUM ('off', 'openai', 'gemini');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE image_generation_status AS ENUM (
    'queued',
    'succeeded',
    'failed',
    'rejected',
    'capped',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS brand_themes (
  id text PRIMARY KEY,
  series_id text NOT NULL,
  version integer NOT NULL,
  tokens jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS design_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind design_project_kind NOT NULL,
  variant text,
  title text NOT NULL,
  status design_project_status NOT NULL DEFAULT 'draft',
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_projects_kind_status
  ON design_projects (kind, status);

CREATE TABLE IF NOT EXISTS design_fact_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  facts_hash text NOT NULL,
  facts jsonb NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_design_fact_snapshots_project_hash
  ON design_fact_snapshots (project_id, facts_hash);

CREATE TABLE IF NOT EXISTS design_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  facts_snapshot_id uuid NOT NULL REFERENCES design_fact_snapshots(id),
  facts_hash text NOT NULL,
  art_hash text,
  content_hash text NOT NULL,
  brand_theme_id text REFERENCES brand_themes(id),
  layout_preset text,
  status design_project_status NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_design_versions_project
  ON design_versions (project_id, version_number DESC);

CREATE TABLE IF NOT EXISTS design_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES design_versions(id) ON DELETE CASCADE,
  role design_page_role NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  layout_preset text,
  day_key text,
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_pages_version_sort
  ON design_pages (version_id, sort_order);

CREATE TABLE IF NOT EXISTS design_asset_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES design_versions(id) ON DELETE CASCADE,
  creator_asset_id uuid REFERENCES creator_assets(id) ON DELETE SET NULL,
  role text NOT NULL,
  rights text,
  provenance text,
  documentary boolean NOT NULL DEFAULT true,
  generated boolean NOT NULL DEFAULT false,
  local_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_asset_links_version
  ON design_asset_links (version_id);

CREATE TABLE IF NOT EXISTS image_generation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES design_projects(id) ON DELETE SET NULL,
  version_id uuid REFERENCES design_versions(id) ON DELETE SET NULL,
  provider image_art_provider_id NOT NULL,
  model text,
  kind image_art_kind NOT NULL DEFAULT 'background',
  prompt_version text,
  attempt_key text NOT NULL,
  status image_generation_status NOT NULL DEFAULT 'queued',
  estimated_cost_usd numeric(10, 4) NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  output_path text,
  source_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_image_generation_attempts_key
  ON image_generation_attempts (attempt_key);
CREATE INDEX IF NOT EXISTS idx_image_generation_attempts_project
  ON image_generation_attempts (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS design_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES design_versions(id) ON DELETE CASCADE,
  format text NOT NULL,
  width_px integer,
  height_px integer,
  storage_path text NOT NULL,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_exports_version
  ON design_exports (version_id, created_at DESC);

CREATE TABLE IF NOT EXISTS design_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES design_versions(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approved', 'revoked')),
  acted_by text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_approvals_version
  ON design_approvals (version_id, created_at DESC);

-- Seed the locked weekend-drop theme row (tokens mirrored from JSON file at runtime).
INSERT INTO brand_themes (id, series_id, version, tokens)
VALUES (
  'kckellie-weekend-drop.v1',
  'weekend-drop',
  1,
  '{"tagline":"Every Thursday, I’m putting you on.","colors":{"navy":"#0B1F3A","yellow":"#F5C518","teal":"#1FA6A0"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
