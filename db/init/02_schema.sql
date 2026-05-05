-- Application schema for social-agent.
-- All tables live in the default public schema of the social_agent database.

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE content_type AS ENUM (
  'testimonial',
  'case_study',
  'success_story',
  'explainer',
  'educational',
  'transformation',
  'founder_message',
  'industry_insight'
);

CREATE TYPE content_state AS ENUM (
  'planned',
  'script_drafted',
  'script_approved',
  'script_rejected',
  'assets_ready',
  'video_generating',
  'video_ready',
  'post_production',
  'ready_to_publish',
  'scheduled',
  'published',
  'failed',
  'cancelled'
);

CREATE TYPE platform AS ENUM (
  'instagram',
  'tiktok',
  'youtube_shorts',
  'linkedin'
);

CREATE TYPE language_code AS ENUM ('en', 'de', 'es');

CREATE TYPE autonomy_mode AS ENUM ('manual', 'hitl', 'auto');

CREATE TYPE publication_status AS ENUM (
  'queued',
  'publishing',
  'published',
  'failed',
  'cancelled'
);

-- ============================================================================
-- REFERENCE
-- ============================================================================

CREATE TABLE industries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          CITEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  visual_style  TEXT,
  topic_seeds   TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- CAMPAIGNS
-- ============================================================================

CREATE TABLE campaigns (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                        TEXT NOT NULL,
  description                 TEXT,
  active                      BOOLEAN NOT NULL DEFAULT true,
  autonomy_mode               autonomy_mode NOT NULL DEFAULT 'hitl',

  -- Weekly quotas per content type
  weekly_testimonials         INT NOT NULL DEFAULT 0,
  weekly_case_studies         INT NOT NULL DEFAULT 0,
  weekly_explainers           INT NOT NULL DEFAULT 0,
  weekly_educational          INT NOT NULL DEFAULT 0,
  weekly_founder_messages     INT NOT NULL DEFAULT 0,
  weekly_industry_insights    INT NOT NULL DEFAULT 0,

  -- Languages this campaign produces
  languages                   language_code[] NOT NULL DEFAULT ARRAY['en']::language_code[],

  -- Publishing cadence — cron expression. Default: 09:00 daily.
  posting_schedule            TEXT NOT NULL DEFAULT '0 9 * * *',
  posting_timezone            TEXT NOT NULL DEFAULT 'Europe/Berlin',

  -- Founder avatar (HeyGen). Set once after avatar training.
  founder_heygen_avatar_id    TEXT,
  founder_heygen_voice_id     TEXT,

  -- Brand
  brand_voice                 TEXT,
  brand_default_cta           TEXT,
  brand_logo_url              TEXT,
  brand_primary_color         TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_industries (
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  industry_id  UUID NOT NULL REFERENCES industries(id) ON DELETE RESTRICT,
  -- Higher weight = picked more often when the planner rotates industries
  weight       INT NOT NULL DEFAULT 1 CHECK (weight > 0),
  PRIMARY KEY (campaign_id, industry_id)
);

-- ============================================================================
-- PERSONAS — recurring characters for testimonial/case-study content
-- ============================================================================

CREATE TABLE personas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  industry_id         UUID REFERENCES industries(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  role                TEXT,
  age_range           TEXT,
  background          TEXT,
  voice_traits        TEXT,

  portrait_image_url  TEXT,
  portrait_prompt     TEXT,
  heygen_avatar_id    TEXT,
  heygen_voice_id     TEXT,

  uses_count          INT NOT NULL DEFAULT 0,
  last_used_at        TIMESTAMPTZ,

  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_personas_campaign  ON personas(campaign_id);
CREATE INDEX idx_personas_industry  ON personas(industry_id);
CREATE INDEX idx_personas_active    ON personas(active) WHERE active;

-- ============================================================================
-- CONTENT ITEMS — the state machine row
-- ============================================================================

CREATE TABLE content_items (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id              UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  industry_id              UUID REFERENCES industries(id) ON DELETE SET NULL,
  persona_id               UUID REFERENCES personas(id) ON DELETE SET NULL,

  type                     content_type NOT NULL,
  language                 language_code NOT NULL DEFAULT 'en',
  state                    content_state NOT NULL DEFAULT 'planned',

  -- Topic + script
  topic                    TEXT NOT NULL,
  topic_embedding          vector(1536),
  hook                     TEXT,
  script                   TEXT,
  cta                      TEXT,
  duration_seconds         INT,

  -- Per-platform copy variations (filled in post-production)
  caption_instagram        TEXT,
  caption_tiktok           TEXT,
  hashtags_instagram       TEXT[],
  hashtags_tiktok          TEXT[],

  -- HeyGen output references
  heygen_video_id          TEXT,
  heygen_video_url         TEXT,

  -- Final video reference
  final_video_url          TEXT,

  -- Scheduling
  planned_for_date         DATE,
  scheduled_for            TIMESTAMPTZ,
  published_at             TIMESTAMPTZ,

  -- Approval (HITL gate)
  script_approved_at       TIMESTAMPTZ,
  script_approved_by       TEXT,
  script_rejection_reason  TEXT,

  -- Failure tracking
  last_error               TEXT,
  retry_count              INT NOT NULL DEFAULT 0,

  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_content_state_active
  ON content_items(state)
  WHERE state NOT IN ('published', 'failed', 'cancelled');

CREATE INDEX idx_content_campaign     ON content_items(campaign_id);
CREATE INDEX idx_content_planned_date ON content_items(planned_for_date);
CREATE INDEX idx_content_scheduled
  ON content_items(scheduled_for)
  WHERE scheduled_for IS NOT NULL;
CREATE INDEX idx_content_dedup_lookup
  ON content_items(campaign_id, industry_id, language, created_at DESC);

-- pgvector ANN index for dedup similarity search
CREATE INDEX idx_content_embedding
  ON content_items USING ivfflat (topic_embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- ASSETS — files attached to content items / personas
-- ============================================================================

CREATE TABLE assets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_item_id   UUID REFERENCES content_items(id) ON DELETE CASCADE,
  persona_id        UUID REFERENCES personas(id) ON DELETE CASCADE,

  kind              TEXT NOT NULL,
  -- kinds: persona_portrait, heygen_video_raw, final_video,
  --        subtitle_srt, thumbnail, b_roll, audio_voiceover

  url               TEXT NOT NULL,
  storage_path      TEXT,
  mime_type         TEXT,
  duration_seconds  INT,
  width             INT,
  height            INT,
  size_bytes        BIGINT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (content_item_id IS NOT NULL OR persona_id IS NOT NULL)
);

CREATE INDEX idx_assets_content  ON assets(content_item_id);
CREATE INDEX idx_assets_persona  ON assets(persona_id);
CREATE INDEX idx_assets_kind     ON assets(kind);

-- ============================================================================
-- PUBLISHING
-- ============================================================================

CREATE TABLE publishing_targets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platform          platform NOT NULL,
  account_handle    TEXT NOT NULL,
  account_id        TEXT,
  -- Reference to credentials stored elsewhere (env vars or vault).
  -- Never store secrets here directly.
  credentials_ref   TEXT,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, platform, account_handle)
);

CREATE TABLE publications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_item_id     UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  target_id           UUID NOT NULL REFERENCES publishing_targets(id) ON DELETE RESTRICT,

  status              publication_status NOT NULL DEFAULT 'queued',
  scheduled_for       TIMESTAMPTZ,
  posted_at           TIMESTAMPTZ,
  remote_post_id      TEXT,
  remote_post_url     TEXT,

  caption             TEXT,
  hashtags            TEXT[],

  error               TEXT,
  retry_count         INT NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (content_item_id, target_id)
);

CREATE INDEX idx_publications_content   ON publications(content_item_id);
CREATE INDEX idx_publications_status    ON publications(status);
CREATE INDEX idx_publications_due
  ON publications(scheduled_for)
  WHERE status = 'queued';

-- ============================================================================
-- WORKFLOW RUNS — audit log for orchestration
-- ============================================================================

CREATE TABLE workflow_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_item_id   UUID REFERENCES content_items(id) ON DELETE CASCADE,
  workflow_name     TEXT NOT NULL,
  state_from        content_state,
  state_to          content_state,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  duration_ms       INT,
  status            TEXT NOT NULL DEFAULT 'running',
  -- 'running', 'success', 'failed'
  error             TEXT,
  payload           JSONB
);

CREATE INDEX idx_runs_content   ON workflow_runs(content_item_id);
CREATE INDEX idx_runs_started   ON workflow_runs(started_at DESC);
CREATE INDEX idx_runs_workflow  ON workflow_runs(workflow_name, started_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER content_items_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER publications_updated_at
  BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================================
-- SEED DATA — industries from the brief
-- ============================================================================

INSERT INTO industries (slug, name, description, topic_seeds) VALUES
  ('dentists',           'Dentists',           'Dental practices and clinics',
   ARRAY['new patient acquisition','online reviews','treatment plan acceptance','recall systems']),
  ('coffee_shops',       'Coffee Shops',       'Independent and chain coffee shops',
   ARRAY['loyalty programs','foot traffic','local SEO','seasonal menus']),
  ('insurance_agencies', 'Insurance Agencies', 'Independent insurance brokers and agencies',
   ARRAY['lead generation','referral networks','client retention','compliance updates']),
  ('restaurants',        'Restaurants',        'Restaurants, bistros, food service',
   ARRAY['repeat visits','online ordering','reviews','staff retention']),
  ('real_estate',        'Real Estate',        'Real estate agents and brokerages',
   ARRAY['listing leads','open house traffic','past-client referrals','market reports']),
  ('fitness_studios',    'Fitness Studios',    'Gyms, yoga, pilates, boutique fitness',
   ARRAY['member acquisition','retention','class fill rate','referrals']),
  ('marketing_agencies', 'Marketing Agencies', 'Digital marketing and creative agencies',
   ARRAY['client acquisition','retention','case studies','positioning']);
