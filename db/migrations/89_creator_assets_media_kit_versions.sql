-- Creator assets + media-kit version immutability.
--
-- Purpose: Kellie can upload photos (via Ask Benson or Creator Assets), preview and
-- approve public use, and assign them to versioned media kits. Approval hashes pin a
-- specific kit content version so regenerating a kit cannot silently change what a
-- recipient sees after Kellie approved a pitch.
--
-- Entirely additive and idempotent. Legacy hashless approvals are frozen from live
-- send by application code (must re-approve under the new hash gate).

-- ---------------------------------------------------------------------------
-- 1. CREATOR ASSETS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE creator_asset_role AS ENUM (
    'hero',
    'headshot',
    'proof_still',
    'lifestyle',
    'property',
    'food',
    'event',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE creator_asset_public_use_state AS ENUM (
    'draft',
    'pending_public_use',
    'approved_public_use',
    'rejected_public_use',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS creator_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Content hash of the original bytes (sha256 hex). Dedup / integrity.
  content_hash text NOT NULL,
  original_filename text,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  -- Original on disk (may retain EXIF for Kellie's private archive).
  storage_filename text NOT NULL,
  -- Public-safe derivative: re-encoded, EXIF-stripped.
  public_storage_filename text,
  thumb_storage_filename text,
  web_storage_filename text,
  print_storage_filename text,
  width_px integer,
  height_px integer,
  role creator_asset_role NOT NULL DEFAULT 'other',
  public_use_state creator_asset_public_use_state NOT NULL DEFAULT 'draft',
  -- Never silently publish: public derivatives only exist after explicit approval.
  public_use_approved_at timestamptz,
  public_use_approved_by text,
  public_use_rejected_at timestamptz,
  public_use_rejection_reason text,
  caption text,
  alt_text text,
  source text NOT NULL DEFAULT 'ask_benson',
  ask_benson_message_id uuid,
  -- MIME authenticity: magic-byte sniff result (may differ from claimed type).
  sniffed_mime_type text,
  exif_stripped boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_assets_public_use
  ON creator_assets (public_use_state);
CREATE INDEX IF NOT EXISTS idx_creator_assets_role
  ON creator_assets (role);
CREATE INDEX IF NOT EXISTS idx_creator_assets_content_hash
  ON creator_assets (content_hash);

-- Which approved assets appear in which kit version (assignment is explicit).
CREATE TABLE IF NOT EXISTS media_kit_asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_kit_id uuid NOT NULL REFERENCES media_kits(id) ON DELETE CASCADE,
  media_kit_version_id uuid,
  creator_asset_id uuid NOT NULL REFERENCES creator_assets(id) ON DELETE CASCADE,
  placement text NOT NULL DEFAULT 'gallery',
  sort_order integer NOT NULL DEFAULT 0,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by text,
  UNIQUE (media_kit_id, creator_asset_id, placement)
);

CREATE INDEX IF NOT EXISTS idx_media_kit_asset_assignments_kit
  ON media_kit_asset_assignments (media_kit_id);
CREATE INDEX IF NOT EXISTS idx_media_kit_asset_assignments_asset
  ON media_kit_asset_assignments (creator_asset_id);

-- ---------------------------------------------------------------------------
-- 2. MEDIA KIT VERSIONS (immutable snapshots)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_kit_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_kit_id uuid NOT NULL REFERENCES media_kits(id) ON DELETE CASCADE,
  -- Monotonic per kit: 1, 2, 3…
  version_number integer NOT NULL,
  -- sha256 of canonical JSON snapshot (subject of approval immutability).
  content_hash text NOT NULL,
  -- Full frozen snapshot used for web/PDF; never mutated after insert.
  content_snapshot jsonb NOT NULL,
  web_slug text,
  pdf_storage_filename text,
  pdf_generated_at timestamptz,
  -- Layer labels: profile / category_template / business_specific
  layer text NOT NULL DEFAULT 'business_specific',
  business_variant text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL DEFAULT 'benson',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_kit_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_media_kit_versions_kit
  ON media_kit_versions (media_kit_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_media_kit_versions_hash
  ON media_kit_versions (content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_kit_versions_slug_version
  ON media_kit_versions (web_slug, version_number)
  WHERE web_slug IS NOT NULL;

-- Point media_kits at the current published version without mutating past versions.
ALTER TABLE media_kits
  ADD COLUMN IF NOT EXISTS current_version_id uuid,
  ADD COLUMN IF NOT EXISTS current_content_hash text;

-- Assignment FK (added after media_kit_versions exists).
DO $$ BEGIN
  ALTER TABLE media_kit_asset_assignments
    ADD CONSTRAINT media_kit_asset_assignments_version_fk
    FOREIGN KEY (media_kit_version_id) REFERENCES media_kit_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3. APPROVAL PIN TO KIT VERSION
-- ---------------------------------------------------------------------------
ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS approved_media_kit_version_id uuid,
  ADD COLUMN IF NOT EXISTS approved_media_kit_content_hash text;

DO $$ BEGIN
  ALTER TABLE outreach_emails
    ADD CONSTRAINT outreach_emails_approved_media_kit_version_fk
    FOREIGN KEY (approved_media_kit_version_id) REFERENCES media_kit_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_outreach_emails_approved_kit_version
  ON outreach_emails (approved_media_kit_version_id);

-- ---------------------------------------------------------------------------
-- 4. NOTES
-- ---------------------------------------------------------------------------
-- Application code must:
--   * refuse live send when approved_at is set but approved_content_hash is null
--     (legacy hashless approvals cannot bypass the new integrity gate);
--   * include mediaKitVersionId + mediaKitContentHash in outreachContentHash;
--   * never serve unapproved creator_assets on public media-kit routes.
