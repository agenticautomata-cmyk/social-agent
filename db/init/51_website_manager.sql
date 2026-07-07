-- Benson Website Manager — Phase 1 (controlled sections, draft approval)

CREATE TABLE IF NOT EXISTS website_sections (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  max_items       INTEGER NOT NULL DEFAULT 6,
  section_type    TEXT NOT NULL DEFAULT 'media_grid',
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_media_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename   TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  file_size           BIGINT NOT NULL DEFAULT 0,
  media_kind          TEXT NOT NULL DEFAULT 'image',
  storage_filename    TEXT NOT NULL,
  thumbnail_filename  TEXT,
  duration_seconds    NUMERIC(10, 2),
  width               INTEGER,
  height              INTEGER,
  uploaded_by         TEXT NOT NULL DEFAULT 'kellie',
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_category         TEXT,
  ai_caption          TEXT,
  ai_alt_text         TEXT,
  ai_content_type     TEXT,
  ai_suggested_placement TEXT,
  ai_metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_media_uploaded ON website_media_items (uploaded_at DESC);

CREATE TABLE IF NOT EXISTS website_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  section_id        TEXT NOT NULL REFERENCES website_sections(id),
  media_item_id     UUID REFERENCES website_media_items(id) ON DELETE SET NULL,
  caption           TEXT,
  alt_text          TEXT,
  headline          TEXT,
  cta_label         TEXT,
  cta_href          TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft',
  benson_reasoning  TEXT,
  created_by        TEXT NOT NULL DEFAULT 'benson',
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_drafts_status ON website_drafts (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_drafts_section ON website_drafts (section_id, status);

CREATE TABLE IF NOT EXISTS website_published_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id          UUID NOT NULL REFERENCES website_drafts(id) ON DELETE CASCADE,
  section_id        TEXT NOT NULL REFERENCES website_sections(id),
  media_item_id     UUID REFERENCES website_media_items(id) ON DELETE SET NULL,
  caption           TEXT,
  alt_text          TEXT,
  headline          TEXT,
  cta_label         TEXT,
  cta_href          TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  published_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by      TEXT NOT NULL DEFAULT 'kellie',
  unpublished_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id)
);

CREATE INDEX IF NOT EXISTS idx_website_published_section
  ON website_published_items (section_id, sort_order)
  WHERE unpublished_at IS NULL;

CREATE TABLE IF NOT EXISTS website_settings (
  id              TEXT PRIMARY KEY DEFAULT 'default',
  site_title      TEXT NOT NULL DEFAULT 'KC Kellie',
  site_tagline    TEXT,
  hero_headline   TEXT,
  hero_subheadline TEXT,
  contact_email   TEXT,
  booking_href    TEXT,
  media_kit_href  TEXT,
  max_upload_bytes BIGINT NOT NULL DEFAULT 26214400,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO website_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

INSERT INTO website_sections (id, label, description, sort_order, max_items, section_type, config) VALUES
  ('homepage_hero', 'Homepage hero', 'Single featured image or video with headline', 1, 1, 'hero',
   '{"allowVideo": true, "fields": ["headline", "caption", "cta_label", "cta_href"]}'::jsonb),
  ('featured_content', 'Featured content', 'Highlight reel for homepage', 2, 4, 'media_grid',
   '{"fields": ["caption", "alt_text"]}'::jsonb),
  ('latest_posts', 'Latest posts', 'Most recent approved content', 3, 8, 'media_grid',
   '{"fields": ["caption", "alt_text"]}'::jsonb),
  ('kc_finds', 'KC finds', 'Kansas City discoveries and local gems', 4, 8, 'media_grid',
   '{"fields": ["caption", "alt_text"]}'::jsonb),
  ('sponsor_highlights', 'Sponsor highlights', 'Brand partnerships and sponsor moments', 5, 4, 'media_grid',
   '{"fields": ["caption", "alt_text"]}'::jsonb),
  ('media_kit_cta', 'Media kit CTA', 'Call-to-action for sponsors — text only', 6, 1, 'cta',
   '{"fields": ["headline", "caption", "cta_label", "cta_href"]}'::jsonb),
  ('contact_cta', 'Contact / booking CTA', 'Book Kellie — text CTA block', 7, 1, 'cta',
   '{"fields": ["headline", "caption", "cta_label", "cta_href"]}'::jsonb)
ON CONFLICT (id) DO NOTHING;
